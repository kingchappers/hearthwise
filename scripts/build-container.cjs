const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Compiles the container server (and, through its imports, the API and static handlers), the same way the other build scripts do.
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build/container');
fs.rmSync(outDir, { recursive: true, force: true });

console.log('Compiling container server...');
execSync(
  'tsc container/bin.ts --outDir build/container --module commonjs --skipLibCheck --strict --target es2020 --resolveJsonModule --esModuleInterop',
  { cwd: root, stdio: 'inherit', env: { ...process.env, PATH: `${path.join(root, 'node_modules/.bin')}${path.delimiter}${process.env.PATH}` } },
);
// The repo root is "type": "module"; this marker lets the compiled CommonJS run. The runtime image has no npm, so the one package
// the container needs (web-push, for sending) is installed here, into build/container, and copied across with the rest.
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ name: 'hearthwise-container', version: '1.0.0', type: 'commonjs', dependencies: { 'web-push': '^3.6.7' } }, null, 2) + '\n');
console.log('Installing container dependencies...');
execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund', { cwd: outDir, stdio: 'inherit' });
fs.rmSync(path.join(outDir, 'package-lock.json'), { force: true });
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

const entry = path.join(outDir, 'container', 'bin.js');
if (!fs.existsSync(entry)) throw new Error(`Expected ${entry} after compiling`);
console.log('Container server compiled to build/container/container/bin.js');
