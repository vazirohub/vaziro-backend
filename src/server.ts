import app from './app';
import { config } from './config';
import { prisma } from './lib/prisma';

const server = app.listen(config.port, () => {
  console.log(`🚀 Vaziro API Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`🇮🇳 Market: India | Currency: INR (₹) | Timezone: Asia/Kolkata`);
});

// Hostinger optimization: Close idle connections quickly to avoid process exhaustion
server.keepAliveTimeout = 5000;
server.headersTimeout = 6000;

const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} signal received: closing HTTP server and terminating process gracefully`);

  // Hard exit fallback after 3 seconds so Hostinger never accumulates zombie processes
  const forceTimer = setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded, forcing process exit.');
    process.exit(0);
  }, 3000);
  forceTimer.unref();

  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await prisma.$disconnect();
    } catch (e) {}
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
