import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../src/server/index.ts');

const child = spawn(process.execPath, ['--import', 'tsx', serverPath], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
