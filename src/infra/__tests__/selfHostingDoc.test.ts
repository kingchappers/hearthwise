import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

// GitHub's anchor for a heading: lower case, punctuation dropped, spaces to dashes.
const anchor = (heading: string): string => heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-');

describe('docs/SELF-HOSTING.md', () => {
  it('exists, since the compose files and the sign-in form point at it', () => {
    expect(existsSync(join(ROOT, 'docs', 'SELF-HOSTING.md'))).toBe(true);
  });

  const headings = (): string[] => [...read('docs/SELF-HOSTING.md').matchAll(/^#{1,4} (.+)$/gm)].map(match => match[1]);

  it('has the section the sign-in form links to', () => {
    const link = read('app/components/authentication/LocalAuthForm.tsx').match(/SELF-HOSTING\.md#([\w-]+)/)?.[1];
    expect(link).toBeTruthy();
    expect(headings().map(anchor)).toContain(link);
  });

  it('has the section both compose examples refer to', () => {
    for (const file of ['compose.example.yml', 'compose.plain.example.yml']) {
      expect(read(file)).toContain('"Check your backups are working"');
    }
    expect(headings()).toContain('Check your backups are working');
  });

  it('names every environment variable the container reads', () => {
    const doc = read('docs/SELF-HOSTING.md');
    for (const name of ['APP_ORIGIN', 'TLS_DOMAIN', 'TLS_EMAIL', 'TRUST_PROXY', 'COOKIE_SECURE', 'BACKUP_HOUR', 'BACKUP_KEEP', 'BACKUP_DIR', 'DATA_DIR', 'PORT']) {
      expect(doc, `${name} is not documented`).toContain(name);
    }
  });

  it('does not carry over the sibling app\'s name or its old-install advice', () => {
    expect(read('docs/SELF-HOSTING.md').toLowerCase()).not.toMatch(/hoardwise|budget\.sqlite/);
    expect(read('compose.example.yml').toLowerCase()).not.toContain('keep their old prefix');
  });
});
