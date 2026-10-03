import { defineConfig, loadEnv, normalizePath } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
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
    const allowed = dev ? sourceFiles.has(file) : file === 'index.html' || file === 'sw.js' || legacyScripts.includes(file) || /^assets\/[\w.-]+\.(js|css)$/.test(file);
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
      { name:'relay-offline-shell',
        configureServer(server) {server.middlewares.use((req,res,next)=>{if(req.url!=='/assets/dexie.js')return next();res.setHeader('Content-Type','text/javascript');res.end(readFileSync(path.join(root,'../../node_modules/dexie/dist/dexie.min.js')));});},
        // Hash all emitted shell resources, including the classic scripts.
        generateBundle: {order:'post',handler(_options,bundle) {
          const vendor=readFileSync(path.join(root,'../../node_modules/dexie/dist/dexie.min.js'));
          this.emitFile({type:'asset',fileName:'assets/dexie.js',source:vendor});
          const files=[...Object.keys(bundle).filter(f=>f==='index.html'||legacyScripts.includes(f)||/^assets\/[\w.-]+\.(js|css)$/.test(f)),'assets/dexie.js'];
          const hash=createHash('sha256').update(vendor);
          for(const file of Object.keys(bundle).sort())hash.update(String(bundle[file].source??bundle[file].code));
          const source=readFileSync(path.join(root,'sw-template.js'),'utf8').replace('__CACHE_VERSION__',hash.digest('hex').slice(0,16)).replace('__SHELL_FILES__',JSON.stringify([...new Set(files.map(f=>'/'+f))]));
          this.emitFile({type:'asset',fileName:'sw.js',source});
        }} },
      { name: 'relay-private-paths',
        configureServer(server) { server.middlewares.use(guard(true)); },
        configurePreviewServer(server) { server.middlewares.use(guard(false)); } },
      { name: 'relay-classic-scripts', apply: 'build',
        // Preserve classic global scope and order until a deliberate module migration.
        transformIndexHtml: { order: 'pre', handler(html) {
          return legacyScripts.reduce((result, file) => result.replace(`<script src="${file}"></script>`, ''), html).replace('<script src="/assets/dexie.js"></script>','');
        } },
        generateBundle() {
          for (const file of legacyScripts) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(path.join(root, file)) });
        } },
      { name: 'relay-classic-tags', apply: 'build',
        transformIndexHtml: { order: 'post', handler() {
          return ['assets/dexie.js',...legacyScripts].map(file => ({ tag: 'script', attrs: { src: `/${file}` }, injectTo: 'body' }));
        } } }
    ]
  };
});
