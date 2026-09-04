// Vaziro Backend Server Entrypoint for Hostinger / Production Deployment
const path = require('path');
const fs = require('fs');

// Ensure tmp directory exists for Passenger / Hostinger restart hooks
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch (e) {}
}

const dbPath = path.resolve(__dirname, 'prisma', 'dev.db');
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:.')) {
  process.env.DATABASE_URL = `file:${dbPath}?connection_limit=1&busy_timeout=5000`;
} else if (process.env.DATABASE_URL.startsWith('file:') && !process.env.DATABASE_URL.includes('connection_limit')) {
  const sep = process.env.DATABASE_URL.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${sep}connection_limit=1&busy_timeout=5000`;
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

