import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
const root = resolve('dist');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.txt':'text/plain', '.ttf':'font/ttf'};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + sep)) {res.writeHead(403);res.end();return;}
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type':types[extname(file)] ?? 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(body);
  } catch {res.writeHead(404); res.end('Not found');}
}).listen(5173,'127.0.0.1',()=>console.log('Local: http://localhost:5173'));
