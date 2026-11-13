import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPLAINED_SYMPTOMS } from '../../../app/lib/signInError';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

describe('docs/AUTH0.md', () => {
  it('exists, and the README links to it', () => {
    expect(existsSync(join(ROOT, 'docs', 'AUTH0.md'))).toBe(true);
    expect(read('README.md')).toContain('docs/AUTH0.md');
  });

  it('quotes every sign-in symptom the app explains, so the doc and the panel cannot drift', () => {
    const doc = read('docs/AUTH0.md');
    for (const symptom of EXPLAINED_SYMPTOMS) {
      expect(doc, `the doc should quote "${symptom.contains}"`).toContain(symptom.contains);
    }
  });

  it('is the file the panel hint points at', () => {
    for (const symptom of EXPLAINED_SYMPTOMS) expect(symptom.hint).toContain('docs/AUTH0.md');
  });

  it('covers each tenant setting the deployed site needs', () => {
    const doc = read('docs/AUTH0.md');
    for (const setting of ['Allow Offline Access', 'User Access', 'Authorization Code', 'Refresh Token Rotation', 'Allowed Callback URLs', 'Allowed Logout URLs', 'Allowed Web Origins', 'first-login']) {
      expect(doc, setting).toContain(setting);
    }
  });
});
