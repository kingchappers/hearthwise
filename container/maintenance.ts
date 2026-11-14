export interface MaintenanceDeps {
  purgeExpired(): number;
  backup(now: Date): void;
  newestBackupAgeSeconds(now: Date): number;
  log(message: string): void;
  // The reminder scheduler: digests, due nudges and held pushes. May take a while; a failure never stops the purge or the backup.
  runScheduler(now: Date): Promise<void>;
}

export interface MaintenanceOptions {
  backupHour: number;
  backupKeep: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;
// The error name, plus a Node error code such as EACCES when there is a plain one: a message can echo paths or SQL.
const SAFE_CODE = /^[A-Z0-9_]{2,40}$/;
function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && SAFE_CODE.test(code) ? `${name} (${code})` : name;
}

function attempt(deps: MaintenanceDeps, label: string, work: () => void): void {
  try {
    work();
  } catch (error) {
    deps.log(`${label} failed: ${describeError(error)}`);
  }
}

async function attemptAsync(deps: MaintenanceDeps, label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.log(`${label} failed: ${describeError(error)}`);
  }
}

function backupIfOlderThan(deps: MaintenanceDeps, now: Date, seconds: number): void {
  attempt(deps, 'Backup', () => {
    if (deps.newestBackupAgeSeconds(now) > seconds) {
      deps.backup(now);
      deps.log('Backup completed');
    }
  });
}

function backupIfDue(deps: MaintenanceDeps, options: MaintenanceOptions, now: Date): void {
  if (options.backupKeep <= 0 || now.getHours() < options.backupHour) return;
  // Due when the newest backup predates today's backup hour: one backup per day, at the first tick from that hour on.
  // A skipped tick (suspended process, a DST hour that does not exist) is made up by the next one, and a backup taken
  // before the backup hour counts as the previous day's.
  const boundary = new Date(now);
  boundary.setHours(options.backupHour, 0, 0, 0);
  backupIfOlderThan(deps, now, (now.getTime() - boundary.getTime()) / 1000);
}

// The purge and the backup run before the first await, so a caller that does not wait still sees them done.
export async function runTick(deps: MaintenanceDeps, options: MaintenanceOptions, now: Date): Promise<void> {
  attempt(deps, 'Expired-item purge', () => { deps.purgeExpired(); });
  backupIfDue(deps, options, now);
  await attemptAsync(deps, 'Reminder scheduler', () => deps.runScheduler(now));
}

export function runCatchUp(deps: MaintenanceDeps, options: MaintenanceOptions, now: Date): void {
  if (options.backupKeep > 0) backupIfOlderThan(deps, now, DAY_SECONDS);
}

export function startMaintenance(
  deps: MaintenanceDeps,
  options: MaintenanceOptions,
  now: () => Date = () => new Date(),
  timers: { setInterval: typeof setInterval; clearInterval: typeof clearInterval } = { setInterval, clearInterval },
): { stop(): void } {
  runCatchUp(deps, options, now());
  const handle = timers.setInterval(() => { void runTick(deps, options, now()); }, HOUR_MS);
  handle.unref();
  return { stop: () => timers.clearInterval(handle) };
}
