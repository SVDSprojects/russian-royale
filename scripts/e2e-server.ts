import { createApp } from '../server/app';
process.env.NODE_ENV = 'production';
const instance = createApp({
  dbPath: 'data/e2e/royale.sqlite',
  uploadsDir: 'data/e2e/uploads',
  testMode: true,
});
const listener = instance.app.listen(4173, '127.0.0.1', () =>
  console.log('Isolated E2E server: http://127.0.0.1:4173'),
);
function close() {
  instance.close();
  listener.closeAllConnections();
  listener.close(() => process.exit(0));
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
