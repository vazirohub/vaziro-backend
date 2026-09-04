import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export function getNormalizedDatabaseUrl(): string {
  let dbUrl = process.env.DATABASE_URL || '';

  // If not set or relative SQLite file path (e.g. file:./dev.db or file:prisma/dev.db)
  if (!dbUrl || dbUrl.startsWith('file:.')) {
    const candidatePaths = [
      path.resolve(__dirname, '../../prisma/dev.db'),
      path.resolve(__dirname, '../../../prisma/dev.db'),
      path.resolve(process.cwd(), 'prisma/dev.db'),
      path.resolve(process.cwd(), 'dev.db'),
    ];

    let foundPath = candidatePaths[0];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    dbUrl = `file:${foundPath}`;
  }

  // If SQLite URL, ensure connection_limit=1 and busy_timeout=5000 to prevent locks/deadlocks
  if (dbUrl.startsWith('file:')) {
    const cleanUrl = dbUrl.split('?')[0];
    dbUrl = `${cleanUrl}?connection_limit=1&busy_timeout=5000`;
  }

  return dbUrl;
}

const dbUrl = getNormalizedDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Enable WAL mode & 5s busy timeout on SQLite to prevent locking & slow queries
if (dbUrl.startsWith('file:')) {
  prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
  prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => {});
  prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {});
}
