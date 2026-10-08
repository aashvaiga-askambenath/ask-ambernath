const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

async function main() {
  const port = 41000 + Math.floor(Math.random() * 10000);
  const origin = `http://127.0.0.1:${port}`;
  let startupOutput = '';
  const child = spawn(process.execPath, [path.join(__dirname, 'start.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      APP_URL: 'https://ask-ambernath.example',
      CLIENT_ORIGIN: 'https://ask-ambernath.example',
      SUPABASE_URL: 'https://example-project.supabase.co',
      SUPABASE_ANON_KEY: 'smoke-test-anon-placeholder',
      SUPABASE_SERVICE_ROLE_KEY: 'smoke-test-service-role-placeholder',
      VITE_SUPABASE_URL: 'https://example-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'smoke-test-anon-placeholder',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { startupOutput += chunk.toString(); });
  child.stderr.on('data', (chunk) => { startupOutput += chunk.toString(); });

  try {
    let health;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) throw new Error('Production server exited before becoming ready');
      try {
        health = await fetch(`${origin}/api/health`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    assert.ok(health, `health endpoint did not respond${startupOutput ? `: ${startupOutput.trim()}` : ''}`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.databaseConfigured, true);

    const home = await fetch(origin);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Ask Ambernath/);
    console.info('Production startup smoke check passed: /api/health and SPA root returned 200.');
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
