/**
 * TRENDARYO - Local dev server
 *
 * Serves the static site AND the /api gateway on one origin, mirroring what
 * `vercel dev` does but without the Vercel CLI (which fails to spawn its
 * worker on Node 25 / Windows).
 *
 * Why this exists: the admin sign-in page (and every other page that talks to
 * the backend) calls /api/*. A plain static server such as VS Code Live Server
 * only serves files, so /api/auth/me returns 404 and admin login always fails
 * with "Backend rejected the session". Running this file serves both.
 *
 * Usage:  npm run dev   ->  http://localhost:3000
 */

try { require('dotenv').config(); } catch (e) { /* optional */ }

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

const gateway = require(path.join(ROOT, 'api', 'index.js'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';

  let file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  // Pretty URLs: /admin -> /admin.html (matches vercel.json routes).
  if (!fs.existsSync(file) && !path.extname(file)) {
    if (fs.existsSync(file + '.html')) file = file + '.html';
  }

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(file).on('error', () => res.end()).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    req.query = {};
    for (const [key, value] of url.searchParams) req.query[key] = value;
    // Same contract vercel.json passes to the single function gateway.
    req.query.__route = url.pathname.replace(/^\/api/, '') || '/';
    try {
      await gateway(req, res);
    } catch (error) {
      console.error('[dev-server] gateway error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: { message: 'Internal server error' } }));
      } else {
        res.end();
      }
    }
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log('Trendaryo dev server (static + /api) running at http://localhost:' + PORT);
  console.log('Admin sign-in: http://localhost:' + PORT + '/admin-login.html');
});
