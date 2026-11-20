import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Leaf {
  cert: string;
  key: string;
}

export interface TestPki {
  ca: string;
  otherCa: string;
  leaf: (names: string[]) => Leaf;
  otherLeaf: (names: string[]) => Leaf;
  dispose: () => void;
}

// A throw-away certificate authority for the fetcher tests, made with openssl in a temporary folder. The fetcher is given this
// authority as its trusted certificates, so the tests exercise the real certificate and host-name checks over a real TLS connection.
export function createTestPki(): TestPki {
  const dir = mkdtempSync(join(tmpdir(), 'hearthwise-pki-'));
  const run = (...args: string[]): void => {
    execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  };
  const authority = (prefix: string): string => {
    run('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${prefix}.key`, '-out', `${prefix}.pem`, '-subj', `/CN=${prefix}`, '-days', '2', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
    return readFileSync(join(dir, `${prefix}.pem`), 'utf8');
  };
  const ca = authority('test-ca');
  const otherCa = authority('other-ca');
  let n = 0;
  const issue = (prefix: string) => (names: string[]): Leaf => {
    const id = `${prefix}-leaf-${++n}`;
    writeFileSync(join(dir, `${id}.ext`), `subjectAltName=${names.map(name => `DNS:${name}`).join(',')}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`);
    run('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', `${id}.key`, '-out', `${id}.csr`, '-subj', `/CN=${names[0]}`);
    run('x509', '-req', '-in', `${id}.csr`, '-CA', `${prefix}.pem`, '-CAkey', `${prefix}.key`, '-CAcreateserial', '-out', `${id}.pem`, '-days', '2', '-extfile', `${id}.ext`);
    return { cert: readFileSync(join(dir, `${id}.pem`), 'utf8'), key: readFileSync(join(dir, `${id}.key`), 'utf8') };
  };
  return { ca, otherCa, leaf: issue('test-ca'), otherLeaf: issue('other-ca'), dispose: () => rmSync(dir, { recursive: true, force: true }) };
}
