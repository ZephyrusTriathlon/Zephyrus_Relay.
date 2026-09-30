const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
let server, api, port;
before(async () => {
  const { createApp } = await import('../apps/api/src/app.js');
  api = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => api.once('listening', resolve));
  const { createServer } = await import('vite');
  server = await createServer({ configFile: path.resolve('apps/web/vite.config.js'), server: {
    port: 0, proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}` } }
  } });
  await server.listen();
  port = server.httpServer.address().port;
});
after(async () => {
  await server?.close();
  if (api) await new Promise(resolve => api.close(resolve));
});

function request(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: pathname, headers: { Accept: pathname.endsWith('.css') ? 'text/css' : '*/*' } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'], body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}

test('static server serves the application assets', async () => {
  for (const [pathname, type] of [['/', 'text/html; charset=utf-8'], ['/index.html', 'text/html; charset=utf-8'], ['/src/scripts/script.js', 'text/javascript'], ['/src/scripts/dispatch.js', 'text/javascript'], ['/src/scripts/store.js', 'text/javascript'], ['/src/styles/styles.css', 'text/css']]) {
    const response = await request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.type.split(';')[0].toLowerCase(), type.split(';')[0].toLowerCase(), pathname);
    assert.ok(response.body.length > 0, pathname);
  }
});

test('Vite proxies API health and loads frontend environment configuration', async () => {
  assert.deepEqual(JSON.parse((await request('/api/health')).body), { status: 'ok', service: 'zephyrus-relay-api' });
  assert.match((await request('/')).body, /@vite\/client/);
  assert.match((await request('/src/config.js')).body, /VITE_API_BASE_URL/);
});

test('static server hides datasets, internal paths and traversal requests', async () => {
  for (const pathname of [
    '/data/General%20Data/outlets.csv', '/DATA/General%20Data/outlets.csv', '/data%2fGeneral%20Data%2foutlets.csv',
    '/.git/config', '/%2egit/config', '/.git/../src/scripts/script.js', '/.browser-qa/Default/Preferences', '/.browser-qa/../src/scripts/script.js', '/.env', '/.hidden/../src/scripts/script.js',
    '/server.js', '/package.json', '/README.md', '/tests/browser.test.js', '/docs/walkthroughs/P2-security-hardening-walkthrough.md', '/src/scripts/case-study.js', '/src/styles/case-study.css',
    '/script.js', '/styles.css', '/../src/scripts/script.js', '/%2e%2e/src/scripts/script.js', '/data/../src/scripts/script.js', '/%2e%2e%5csrc%5cscripts%5cscript.js', '/%2F..%2Fsrc/scripts/script.js', '/%E0%A4%A',
    '/vite.config.js', '/static-policy.js', '/@fs/D:/GitHubProjects/Zephyrus_Relay/package.json', '/@fs/D:/GitHubProjects/Zephyrus_Relay/data/test.csv', '/.env?raw', '/package.json?raw', '/src/config.js/../../package.json',
    '/data/General%20Data/vehicles.csv', '/data/General%20Data/calendar.csv', '/prisma/schema.prisma', '/prisma/seed.js', '/prisma.config.mjs', '/prisma/migrations/20261001000100_initial_domain/migration.sql', '/apps/api/src/db.js'
  ]) {
    const response = await request(pathname);
    assert.equal(response.status, 404, pathname);
    assert.equal(response.body, 'Not found', pathname);
  }
});
