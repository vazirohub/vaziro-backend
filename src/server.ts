import app from './app';
import { config } from './config';

const server = app.listen(config.port, () => {
  console.log(`🚀 Vaziro API Server running on port ${config.port} in ${config.nodeEnv} mode`);
  console.log(`🇮🇳 Market: India | Currency: INR (₹) | Timezone: Asia/Kolkata`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export default server;
