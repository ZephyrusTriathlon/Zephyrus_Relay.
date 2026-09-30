import { realpathSync } from 'node:fs';
import path from 'node:path';
export const legacyScripts = ['workspace', 'dispatch', 'store', 'field', 'script'].map(name => `src/scripts/${name}.js`);
export const sourceFiles = new Set(['index.html', 'src/config.js', ...legacyScripts,
  ...['styles', 'dispatch', 'store', 'field'].map(name => `src/styles/${name}.css`)]);

// Inspect raw URLs before framework traversal normalization.
export function publicPath(url) {
  try {
    const pathname = decodeURIComponent(url.split(/[?#]/, 1)[0]);
    if (!pathname.startsWith('/') || pathname.includes('\\')) return null;
    if (pathname.split('/').some(part => part.startsWith('.') || part.toLowerCase() === 'data')) return null;
    return pathname === '/' ? 'index.html' : pathname.slice(1);
  } catch { return null; }
}
export function containedFile(root, filename) {
  try {
    const relative = path.relative(realpathSync(root), realpathSync(path.join(root, filename)));
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  } catch { return false; }
}
export function notFound(res) { res.statusCode = 404; res.end('Not found'); }
