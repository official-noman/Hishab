/**
 * Tiny zero-dependency static server for local development / phone testing.
 * Usage: npm start        (then open http://localhost:5173)
 * Phone: same Wi-Fi -> http://<your-pc-ip>:5173
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};

function safePath(urlPath) {
  let p = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const resolved = normalize(join(ROOT, p));
  if (!resolved.startsWith(normalize(ROOT + sep)) && resolved !== normalize(ROOT)) return null;
  return resolved;
}

const server = createServer(async (req, res) => {
  try {
    let file = safePath(req.url);
    if (!file) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let info = null;
    try {
      info = await stat(file);
    } catch {
      info = null;
    }
    if (!info || info.isDirectory()) {
      // SPA fallback (only for extension-less routes)
      if (extname(file)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
        return;
      }
      file = join(ROOT, 'index.html');
    }
    const data = await readFile(file);
    const ext = extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
      'x-content-type-options': 'nosniff',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Server error');
    console.error(err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Hishab dev server`);
  console.log(`  Local:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Phone:  http://${net.address}:${PORT}  (same Wi-Fi)`);
      }
    }
  }
  console.log('');
});
