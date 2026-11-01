import { createServer } from 'node:http';
const destination = 'https://russian-royale.russian-royale.workers.dev';
createServer((req, res) => {
  const path = new URL(req.url || '/', 'http://localhost');
  res.writeHead(302, { Location: destination + path.pathname + path.search, 'Cache-Control': 'no-store' });
  res.end();
}).listen(3001, '0.0.0.0');
