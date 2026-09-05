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

  // If SQLite URL, ensure clean file path without invalid query parameters
  if (dbUrl.startsWith('file:')) {
    dbUrl = dbUrl.split('?')[0];
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

global.prisma = prisma;

