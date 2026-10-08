const { spawn } = require('node:child_process');
const path = require('node:path');

const processes = [
  spawn(process.execPath, [path.join(__dirname, 'index.js')], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'client/vite.config.js'], {
    stdio: 'inherit',
    env: process.env,
  }),
];
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of processes) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of processes) {
  child.on('error', () => shutdown(1));
  child.on('exit', (code) => {
    if (!shuttingDown) shutdown(code || 0);
  });
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
