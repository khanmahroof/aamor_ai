import { spawn, execFileSync } from 'node:child_process';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// A separate process and database keep the owner's local workspace out of the trial.
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const dir = resolve('storage/friend-trial');
const port = 3001;
await readFile('.next/BUILD_ID').catch(() => { throw new Error('Run npm run build first.'); });
await new Promise((done, reject) => {
  const check = createServer();
  check.once('error', reject);
  check.listen(port, '127.0.0.1', () => check.close(done));
});
await mkdir(dir, { recursive: true });
const database = resolve(dir, 'trial.db');
try { await (await open(database, 'wx', 0o600)).close(); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const secretPath = resolve(dir, 'auth-secret');
try { await writeFile(secretPath, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const env = {
  ...process.env,
  DATABASE_URL: `file:${database.replaceAll('\\', '/')}`,
  UPLOAD_DIR: resolve(dir, 'uploads'),
  AUTH_SECRET: (await readFile(secretPath, 'utf8')).trim(),
  OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  AI_DEFAULT_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  CHAT_RATE_LIMIT: '10', CHAT_CONCURRENT_LIMIT: '1', MAX_UPLOAD_SIZE_MB: '5',
  MAX_OUTPUT_TOKENS: '1024', NEXT_TELEMETRY_DISABLED: '1',
};
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env, stdio: 'inherit', windowsHide: true,
});
let app;
let tunnel;
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  app?.kill();
  tunnel?.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());
process.on('exit', () => { app?.kill(); tunnel?.kill(); });
try {
  tunnel = spawn('ssh', [
    '-T', '-F', process.platform === 'win32' ? 'NUL' : '/dev/null',
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityFile=none',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${resolve(dir, 'known_hosts')}`,
    '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
    '-o', 'ExitOnForwardFailure=yes', '-R', `80:127.0.0.1:${port}`, 'nokey@localhost.run',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const origin = await new Promise((done, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Tunnel connection timed out.')), 60000);
    const inspect = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      output = (output + text).slice(-20000);
      const url = output.match(/tunneled with tls termination, (https:\/\/[a-z0-9-]+\.(?:lhr\.life|lhr\.rocks|localhost\.run))\b/i)?.[1];
      if (url) { clearTimeout(timer); done(url); }
    };
    tunnel.stdout.on('data', inspect);
    tunnel.stderr.on('data', inspect);
    tunnel.once('error', (error) => { clearTimeout(timer); reject(error); });
    tunnel.once('exit', () => { clearTimeout(timer); reject(new Error('Tunnel closed.')); close(1); });
  });
  env.NEXTAUTH_URL = origin;
  env.NEXTAUTH_URL_INTERNAL = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
  });
  app.once('error', (error) => { console.error(error.message); close(1); });
  app.once('exit', () => close(1));
  let ready = false;
  for (let attempt = 0; attempt < 40 && !closing; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/login`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for server startup. */ }
    await delay(500);
  }
  if (!ready) throw new Error('Trial server did not become ready.');
  await writeFile(resolve(dir, 'current-link.txt'), origin + '\n');
  console.log(`\nAAMOR FRIEND TRIAL READY: ${origin}\nShare this link. Your friend creates a new account.\nKeep this process, Ollama and your computer running. Ctrl+C ends sharing.\nThe temporary domain can change or expire. Traffic passes through localhost.run.\n`);
} catch (error) {
  console.error(error.message);
  close(1);
}
