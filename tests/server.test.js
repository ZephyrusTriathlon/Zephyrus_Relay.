const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function request(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: 4173, path: pathname }, response => {
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
    assert.equal(response.type, type, pathname);
    assert.ok(response.body.length > 0, pathname);
  }
});

test('static server hides datasets, internal paths and traversal requests', async () => {
  for (const pathname of [
    '/data/General%20Data/outlets.csv', '/DATA/General%20Data/outlets.csv', '/data%2fGeneral%20Data%2foutlets.csv',
    '/.git/config', '/%2egit/config', '/.git/../src/scripts/script.js', '/.browser-qa/Default/Preferences', '/.browser-qa/../src/scripts/script.js', '/.env', '/.hidden/../src/scripts/script.js',
    '/server.js', '/package.json', '/README.md', '/tests/browser.test.js', '/docs/walkthroughs/P2-security-hardening-walkthrough.md', '/src/scripts/case-study.js', '/src/styles/case-study.css',
    '/script.js', '/styles.css', '/../src/scripts/script.js', '/%2e%2e/src/scripts/script.js', '/data/../src/scripts/script.js', '/%2e%2e%5csrc%5cscripts%5cscript.js', '/%2F..%2Fsrc/scripts/script.js', '/%E0%A4%A'
  ]) {
    const response = await request(pathname);
    assert.equal(response.status, 404, pathname);
    assert.equal(response.body, 'Not found', pathname);
  }
});
