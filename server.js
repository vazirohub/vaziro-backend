// Vaziro Backend Server Entrypoint for Hostinger / Production Deployment
const path = require('path');
const fs = require('fs');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const distServer = path.join(__dirname, 'dist', 'server.js');

if (fs.existsSync(distServer)) {
  require(distServer);
} else {
  console.error('Compiled dist/server.js not found! Attempting to build with tsc...');
  try {
    const { execSync } = require('child_process');
    execSync('npx prisma generate && npx tsc', { stdio: 'inherit' });
    require(distServer);
  } catch (err) {
    console.error('Failed to run fallback build:', err);
    process.exit(1);
  }
}
