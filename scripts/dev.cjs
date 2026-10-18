'use strict';

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const windows = process.platform === 'win32';
const root = path.resolve(__dirname, '..');
const children = [
    spawn(process.execPath, [path.join(__dirname, 'assets.cjs'), '--watch'], {
        cwd: root, stdio: 'inherit'
    }),
    spawn('bundle', ['exec', 'jekyll', 'serve', '-w', '-l', '--host', '0.0.0.0'], {
        cwd: root, stdio: 'inherit', shell: windows
    })
];
let stopping = false;
function stop(code) {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
        if (!child.pid || child.exitCode !== null) continue;
        if (windows) {
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
            child.kill('SIGTERM');
        }
    }
    process.exitCode = code;
}
for (const child of children) {
    child.once('error', error => { console.error(error.message); stop(1); });
    child.once('exit', code => stop(code === null ? 1 : code));
}
process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
