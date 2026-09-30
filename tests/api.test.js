const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
let server, base;
before(async () => {
  const { createApp } = await import('../apps/api/src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

test('API health, security headers, 404 and JSON errors', async () => {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'zephyrus-relay-api' });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-powered-by'), null);
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Not found' });
  for (const [body, status] of [['{', 400], [JSON.stringify({ value: 'x'.repeat(110000) }), 413]]) {
    const result = await fetch(`${base}/api/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(result.status, status);
    assert.ok((await result.json()).error);
  }
});

test('built frontend entry and every linked asset load from Express', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200, 'Run npm run build before foundation tests');
  const html = await response.text();
  assert.match(html, /id="app"/);
  assert.match(html, /assets\/.*\.css/);
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
    assert.equal((await fetch(base + match[1])).status, 200, match[1]);
  }
});

test('production does not serve private files or traversal paths', async () => {
  for (const pathname of ['/data/test.csv', '/DATA/test.csv', '/.git/config', '/.env', '/package.json', '/README.md', '/server.js', '/src/app.js', '/src/config.js', '/vite.config.js', '/static-policy.js', '/@fs/D:/GitHubProjects/Zephyrus_Relay/.env', '/src/scripts/case-study.js', '/src/styles/case-study.css', '/%2e%2e/src/scripts/script.js', '/data/../src/scripts/script.js', '/%E0%A4%A']) {
    const status = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(status, 404, pathname);
  }
});
