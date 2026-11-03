import { startLocalServer } from './index.js';

const running = await startLocalServer({ port: Number(process.env.PORT ?? 8787) });
console.log(`Servidor local em ${running.url}`);

const shutdown = async () => {
  await running.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
