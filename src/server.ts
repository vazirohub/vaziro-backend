import http from 'http';
import app from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { SocketService } from './services/socket.service';

const server = http.createServer(app);
SocketService.init(server);

server.listen(config.port, () => {
  console.log(`🚀 Vaziro API Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`🇮🇳 Market: India | Currency: INR (₹) | Timezone: Asia/Kolkata`);
  console.log(`⚡ Real-Time Socket.IO engine attached & active`);
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
