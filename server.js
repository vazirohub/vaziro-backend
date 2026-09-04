// Vaziro Backend Server Entrypoint for Hostinger / Production Deployment
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'prisma', 'dev.db');
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${dbPath}`;
}

// Automatically sync schema on server boot
try {
  const { execSync } = require('child_process');
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'ignore' });
} catch (err) {
  console.warn('[Server] DB sync notice:', err.message);
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
