import { defineConfig, loadEnv, normalizePath } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { legacyScripts, sourceFiles, publicPath, containedFile, notFound } from './static-policy.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const viteEnv = normalizePath(fileURLToPath(import.meta.resolve('vite/dist/client/env.mjs')));
function guard(dev) {
  return (req, res, next) => {
    const file = publicPath(req.url);
    if (file === null) return notFound(res);
    if (file.startsWith('api/')) return next();
    if (dev && (file === '@vite/client' || file === `@fs/${viteEnv}`)) return next();
    const directory = dev ? root : path.join(root, 'dist');
    const allowed = dev ? sourceFiles.has(file) : file === 'index.html' || legacyScripts.includes(file) || /^assets\/[\w.-]+\.(js|css)$/.test(file);
    if (!allowed || !containedFile(directory, file)) return notFound(res);
    next();
  };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const proxy = { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001' } };
  return {
    root, publicDir: false, appType: 'mpa',
    server: { host: '127.0.0.1', port: 4173, strictPort: true, proxy, fs: { strict: true } },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
    plugins: [
      { name: 'relay-private-paths',
        configureServer(server) { server.middlewares.use(guard(true)); },
        configurePreviewServer(server) { server.middlewares.use(guard(false)); } },
      { name: 'relay-classic-scripts', apply: 'build',
        // Preserve classic global scope and order until a deliberate module migration.
        transformIndexHtml: { order: 'pre', handler(html) {
          return legacyScripts.reduce((result, file) => result.replace(`<script src="${file}"></script>`, ''), html);
        } },
        generateBundle() {
          for (const file of legacyScripts) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(path.join(root, file)) });
        } },
      { name: 'relay-classic-tags', apply: 'build',
        transformIndexHtml: { order: 'post', handler() {
          return legacyScripts.map(file => ({ tag: 'script', attrs: { src: `/${file}` }, injectTo: 'body' }));
        } } }
    ]
  };
});
