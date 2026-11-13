import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ commands: [] as unknown[], fail: false }));
vi.mock('@aws-sdk/client-sns', () => ({
  SNSClient: class { async send(command: unknown) { if (sent.fail) throw new Error('sns down'); sent.commands.push(command); } },
  PublishCommand: class { constructor(public input: unknown) {} },
}));

import { emitSecurityEvent, type SecurityEvent } from '../events';

const event: SecurityEvent = { event: 'household_created', userId: 'auth0|u1', householdId: 'h1', at: '2026-11-13T10:00:00.000Z' };

beforeEach(() => {
  vi.stubEnv('ALERT_TOPIC_ARN', 'arn:aws:sns:eu-west-2:123456789012:hearthwise-alerts');
  sent.commands = [];
  sent.fail = false;
});
afterEach(() => vi.unstubAllEnvs());

describe('emitSecurityEvent', () => {
  it('writes one JSON log line with the event type, ids and time', async () => {
    const lines: string[] = [];
    await emitSecurityEvent(event, { log: line => lines.push(line), publish: async () => undefined });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({ type: 'security_event', event: 'household_created', userId: 'auth0|u1', householdId: 'h1', at: event.at });
  });

  it('leaves householdId out when there is none', async () => {
    const lines: string[] = [];
    await emitSecurityEvent({ event: 'user_first_seen', userId: 'auth0|u2', at: event.at }, { log: line => lines.push(line) });
    expect(Object.keys(JSON.parse(lines[0])).sort()).toEqual(['at', 'event', 'type', 'userId']);
  });

  it('publishes the same four fields once when a topic is configured', async () => {
    const published: string[] = [];
    await emitSecurityEvent(event, { log: () => undefined, publish: async message => { published.push(message); } });
    expect(published).toHaveLength(1);
    expect(JSON.parse(published[0])).toEqual({ event: 'household_created', userId: 'auth0|u1', householdId: 'h1', at: event.at });
  });

  it('does not publish when no topic is configured', async () => {
    vi.stubEnv('ALERT_TOPIC_ARN', '');
    const publish = vi.fn();
    const lines: string[] = [];
    await emitSecurityEvent(event, { log: line => lines.push(line), publish });
    expect(publish).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
  });

  it.each([
    ['rejects', async () => { throw new Error('boom: secret detail'); }],
    ['throws before returning a promise', () => { throw new Error('boom: secret detail'); }],
  ])('carries on when publishing %s, and logs only the event type', async (_name, publish) => {
    const warnings: string[] = [];
    await expect(emitSecurityEvent(event, { log: () => undefined, warn: line => warnings.push(line), publish })).resolves.toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('household_created');
    expect(warnings[0]).not.toContain('auth0|u1');
    expect(warnings[0]).not.toContain('secret detail');
  });

  it('copies only the known fields, so an email or name can never reach the log or the topic', async () => {
    const lines: string[] = [];
    const published: string[] = [];
    const dirty = { ...event, email: 'me@example.com', displayName: 'Sam' } as SecurityEvent;
    await emitSecurityEvent(dirty, { log: line => lines.push(line), publish: async message => { published.push(message); } });
    for (const text of [...lines, ...published]) {
      expect(text).not.toContain('me@example.com');
      expect(text).not.toContain('Sam');
    }
  });

  it('publishes through SNS by default, to the configured topic, loading the client only then', async () => {
    await emitSecurityEvent(event, { log: () => undefined });
    expect(sent.commands).toHaveLength(1);
    const input = (sent.commands[0] as { input: { TopicArn: string; Message: string; Subject: string } }).input;
    expect(input.TopicArn).toBe('arn:aws:sns:eu-west-2:123456789012:hearthwise-alerts');
    expect(JSON.parse(input.Message)).toMatchObject({ event: 'household_created', userId: 'auth0|u1' });
    expect(input.Subject).toBe('Hearthwise: household_created');
  });

  it('survives the default SNS client failing', async () => {
    sent.fail = true;
    const warnings: string[] = [];
    await expect(emitSecurityEvent(event, { log: () => undefined, warn: line => warnings.push(line) })).resolves.toBeUndefined();
    expect(warnings[0]).toContain('household_created');
  });
});
