// Servidor estatico do projeto. Precisa ser http: o visualizador 3D carrega os
// GLB por fetch, e o navegador bloqueia fetch em file://.
//
//   node servidor.js                -> o site, em http://127.0.0.1:8080
//   node servidor.js design-system  -> o snapshot do iyO One, a referencia
//   node servidor.js . 9000         -> outra porta
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const ROOT = require('path').resolve(process.argv[2] || __dirname);
const PORT = Number(process.argv[3] || 8080);
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.webp':'image/webp', '.avif':'image/avif', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.otf':'font/otf',
  '.mp4':'video/mp4', '.webm':'video/webm', '.m4v':'video/mp4',
  '.exr':'image/x-exr', '.hdr':'image/vnd.radiance', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.wasm':'application/wasm',
  '.txt':'text/plain; charset=utf-8', '.xml':'application/xml',
};
function typeFor(p) {
  const ext = path.extname(p).toLowerCase();
  if (TYPES[ext]) return TYPES[ext];
  // extensionless: sniff
  try {
    const buf = Buffer.alloc(512);
    const fd = fs.openSync(p, 'r');
    const n = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n);
    if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
    if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
    if (head.slice(0,3).toString('latin1') === 'GIF') return 'image/gif';
    if (head.slice(0,4).toString('latin1') === 'RIFF') return 'image/webp';
    const s = head.toString('utf8');
    if (/^\s*[{[]/.test(s)) return 'application/json; charset=utf-8';
    if (/[\x00-\x08\x0e-\x1f]/.test(s)) return 'application/octet-stream';
    return 'text/javascript; charset=utf-8';
  } catch { return 'application/octet-stream'; }
}
http.createServer((req, res) => {
  let p = decodeURIComponent(url.parse(req.url).pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('404 ' + p); console.log('404', p); return; }
    const type = typeFor(file);
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m[1] ? parseInt(m[1]) : 0;
      let end = m[2] ? parseInt(m[2]) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, {'Content-Range': `bytes */${st.size}`}); res.end(); return; }
      res.writeHead(206, {
        'Content-Type': type, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': end - start + 1, 'Cache-Control':'no-cache',
      });
      fs.createReadStream(file, {start, end}).pipe(res);
    } else {
      res.writeHead(200, {'Content-Type': type, 'Accept-Ranges':'bytes', 'Content-Length': st.size, 'Cache-Control':'no-cache'});
      fs.createReadStream(file).pipe(res);
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT));
