const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(__dirname);
const publicFiles = new Set([
  'index.html',
  ...['styles.css','dispatch.css','store.css','field.css'].map(file => path.join('src', 'styles', file)),
  ...['workspace.js','dispatch.js','store.js','field.js','script.js'].map(file => path.join('src', 'scripts', file))
]);
http.createServer((req, res) => {
  const notFound = () => { res.writeHead(404); res.end('Not found'); };
  let pathname;
  try { pathname = decodeURIComponent(req.url.split(/[?#]/, 1)[0]); }
  catch { return notFound(); }
  const segments = pathname.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.') || segment.toLowerCase() === 'data')) return notFound();
  const file = path.resolve(root, pathname === '/' ? 'index.html' : segments.join('/'));
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || !publicFiles.has(relative)) return notFound();
  fs.realpath(file, (error, finalFile) => {
    if (error) return notFound();
    const finalRelative = path.relative(root, finalFile);
    if (finalRelative === '..' || finalRelative.startsWith('..' + path.sep) || path.isAbsolute(finalRelative)) return notFound();
    fs.readFile(finalFile, (readError, data) => {
      if (readError) return notFound();
      res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[path.extname(finalFile)] || 'application/octet-stream');
      res.end(data);
    });
  });
}).listen(4173, '127.0.0.1', () => console.log('Relay running at http://localhost:4173'));
