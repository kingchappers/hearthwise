import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { opKey, planPatch, planUpdate } from './patch';
import {
  ConditionFailedError, type Item, type Key, type PatchOptions, type QueryOptions, type Store, type TxOp, type UpdateOp,
} from './types';

export interface Sender {
  send(command: any): Promise<any>;
}

// DynamoDB cancels a transaction with TransactionConflict when another transaction touches the same item at the same moment.
const MAX_CONFLICT_RETRIES = 3;
const BACKOFF_BASE_MS = 50;

export interface RetryOptions {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const MUST_BE_ABSENT = 'attribute_not_exists(PK)';
const MUST_BE_PRESENT = 'attribute_exists(PK)';

function keyOf(key: Key): Key {
  return { PK: key.PK, SK: key.SK };
}

function conditional(expression: string | undefined): { ConditionExpression?: string } {
  return expression ? { ConditionExpression: expression } : {};
}

function translate(error: unknown): unknown {
  if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
    return new ConditionFailedError();
  }
  return error;
}

function cancellationCodes(error: unknown): string[] {
  const reasons = (error as Error & { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  return reasons.map(reason => reason.Code ?? '');
}

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.name === 'TransactionCanceledException' && cancellationCodes(error).includes('TransactionConflict');
}

interface UpdateItem {
  TableName: string;
  Key: Key;
  UpdateExpression: string;
  ConditionExpression?: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}

function updateItem(table: string, op: UpdateOp): UpdateItem {
  const plan = planUpdate(op);
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const conditions: string[] = plan.mustExist ? [MUST_BE_PRESENT] : [];

  const assignments = plan.set.map(([name, value], index) => {
    names[`#s${index}`] = name;
    values[`:s${index}`] = value;
    return `#s${index} = :s${index}`;
  });
  const removals = plan.remove.map((name, index) => {
    names[`#r${index}`] = name;
    return `#r${index}`;
  });
  plan.ifEquals.forEach(([name, value], index) => {
    names[`#e${index}`] = name;
    values[`:e${index}`] = value;
    conditions.push(`#e${index} = :e${index}`);
  });
  plan.ifMissing.forEach((name, index) => {
    names[`#m${index}`] = name;
    conditions.push(`attribute_not_exists(#m${index})`);
  });

  const clauses = [
    ...(assignments.length > 0 ? [`SET ${assignments.join(', ')}`] : []),
    ...(removals.length > 0 ? [`REMOVE ${removals.join(', ')}`] : []),
  ];
  return {
    TableName: table,
    Key: keyOf(op.update),
    UpdateExpression: clauses.join(' '),
    ...conditional(conditions.length > 0 ? conditions.join(' AND ') : undefined),
    ExpressionAttributeNames: names,
    ...(Object.keys(values).length > 0 ? { ExpressionAttributeValues: values } : {}),
  };
}

function translateTransaction(error: unknown): unknown {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return error;
  const failed = cancellationCodes(error).findIndex(code => code === 'ConditionalCheckFailed');
  return failed >= 0 ? new ConditionFailedError(failed) : error;
}

export class DynamoStore implements Store {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly client: Sender, private readonly table: string, retry: RetryOptions = {}) {
    this.sleep = retry.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.random = retry.random ?? Math.random;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): DynamoStore {
    const table = env.DYNAMODB_TABLE;
    if (!table) {
      throw new Error('DYNAMODB_TABLE is required when STORE=dynamodb');
    }
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: env.AWS_REGION || 'eu-west-2' }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
    return new DynamoStore(client, table);
  }

  async get(key: Key, opts: { consistent?: boolean } = {}): Promise<Item | undefined> {
    const result = await this.client.send(new GetCommand({
      TableName: this.table,
      Key: keyOf(key),
      ...(opts.consistent ? { ConsistentRead: true } : {}),
    }));
    return result.Item as Item | undefined;
  }

  async put(item: Item, opts: { ifAbsent?: boolean } = {}): Promise<void> {
    try {
      await this.client.send(new PutCommand({
        TableName: this.table,
        Item: item,
        ...conditional(opts.ifAbsent ? MUST_BE_ABSENT : undefined),
      }));
    } catch (error) {
      throw translate(error);
    }
  }

  async patch(key: Key, fields: Record<string, unknown>, opts: PatchOptions = {}): Promise<Item> {
    const plan = planPatch(fields, opts.defaults);
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    const assignments: string[] = [];

    plan.fields.forEach(([name, value], index) => {
      names[`#f${index}`] = name;
      values[`:f${index}`] = value;
      assignments.push(`#f${index} = :f${index}`);
    });
    plan.defaults.forEach(([name, value], index) => {
      names[`#d${index}`] = name;
      values[`:d${index}`] = value;
      assignments.push(`#d${index} = if_not_exists(#d${index}, :d${index})`);
    });

    const conditions: string[] = opts.mustExist || opts.ifEquals ? [MUST_BE_PRESENT] : [];
    Object.entries(opts.ifEquals ?? {}).forEach(([name, value], index) => {
      names[`#c${index}`] = name;
      values[`:c${index}`] = value;
      conditions.push(`#c${index} = :c${index}`);
    });

    try {
      const result = await this.client.send(new UpdateCommand({
        TableName: this.table,
        Key: keyOf(key),
        UpdateExpression: `SET ${assignments.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...conditional(conditions.length > 0 ? conditions.join(' AND ') : undefined),
        ReturnValues: 'ALL_NEW',
      }));
      return result.Attributes as Item;
    } catch (error) {
      throw translate(error);
    }
  }

  async delete(key: Key, opts: { ifPresent?: boolean } = {}): Promise<void> {
    try {
      await this.client.send(new DeleteCommand({
        TableName: this.table,
        Key: keyOf(key),
        ...conditional(opts.ifPresent ? MUST_BE_PRESENT : undefined),
      }));
    } catch (error) {
      throw translate(error);
    }
  }

  async query(pk: string, opts: QueryOptions = {}): Promise<Item[]> {
    if (opts.skPrefix !== undefined && opts.skEquals !== undefined) {
      throw new Error('query takes skPrefix or skEquals, not both');
    }

    const names: Record<string, string> = { '#pk': 'PK' };
    const values: Record<string, unknown> = { ':pk': pk };
    let condition = '#pk = :pk';
    if (opts.skEquals !== undefined) {
      names['#sk'] = 'SK';
      values[':sk'] = opts.skEquals;
      condition += ' AND #sk = :sk';
    } else if (opts.skPrefix) {
      names['#sk'] = 'SK';
      values[':sk'] = opts.skPrefix;
      condition += ' AND begins_with(#sk, :sk)';
    }

    let projection: { ProjectionExpression: string } | Record<string, never> = {};
    if (opts.attributes?.length) {
      opts.attributes.forEach((name, index) => { names[`#p${index}`] = name; });
      projection = { ProjectionExpression: opts.attributes.map((_, index) => `#p${index}`).join(', ') };
    }

    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: condition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ...projection,
        ExclusiveStartKey: startKey,
      }));
      items.push(...((result.Items ?? []) as Item[]));
      startKey = result.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  async transact(ops: TxOp[]): Promise<void> {
    if (ops.length === 0) return;
    const keys = ops.map(opKey);
    const identities = new Set(keys.map(key => `${key.PK}\u0000${key.SK}`));
    if (identities.size !== keys.length) {
      throw new Error('transact cannot touch the same item twice');
    }

    // Built before anything is sent, so a malformed update never reaches DynamoDB.
    const items = ops.map(op => {
      if ('put' in op) return { Put: { TableName: this.table, Item: op.put, ...conditional(op.ifAbsent ? MUST_BE_ABSENT : undefined) } };
      if ('delete' in op) return { Delete: { TableName: this.table, Key: keyOf(op.delete), ...conditional(op.ifPresent ? MUST_BE_PRESENT : undefined) } };
      return { Update: updateItem(this.table, op) };
    });

    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.client.send(new TransactWriteCommand({ TransactItems: items }));
        return;
      } catch (error) {
        const translated = translateTransaction(error);
        // A failed condition is final. Only a bare conflict is worth another try.
        if (translated !== error || !isConflict(error) || attempt >= MAX_CONFLICT_RETRIES) throw translated;
        await this.sleep(this.random() * BACKOFF_BASE_MS * 2 ** attempt);
      }
    }
  }
}
