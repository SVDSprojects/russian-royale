import { createApp } from './app.js';

const instance = createApp();
const port = Number(process.env.PORT || 3001),
  host = process.env.HOST || '0.0.0.0';
const server = instance.app.listen(port, host, () =>
  console.log(`Русский Royale API: http://localhost:${port}`),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  instance.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
