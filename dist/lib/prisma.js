"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.getNormalizedDatabaseUrl = getNormalizedDatabaseUrl;
const client_1 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function getNormalizedDatabaseUrl() {
    let dbUrl = process.env.DATABASE_URL || '';
    // If not set or relative SQLite file path (e.g. file:./dev.db or file:prisma/dev.db)
    if (!dbUrl || dbUrl.startsWith('file:.')) {
        const candidatePaths = [
            path_1.default.resolve(__dirname, '../../prisma/dev.db'),
            path_1.default.resolve(__dirname, '../../../prisma/dev.db'),
            path_1.default.resolve(process.cwd(), 'prisma/dev.db'),
            path_1.default.resolve(process.cwd(), 'dev.db'),
        ];
        let foundPath = candidatePaths[0];
        for (const p of candidatePaths) {
            if (fs_1.default.existsSync(p)) {
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
exports.prisma = global.prisma ||
    new client_1.PrismaClient({
        datasources: {
            db: {
                url: dbUrl,
            },
        },
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    global.prisma = exports.prisma;
}
// Enable WAL mode & 5s busy timeout on SQLite to prevent locking & slow queries
if (dbUrl.startsWith('file:')) {
    exports.prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => { });
    exports.prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;').catch(() => { });
    exports.prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => { });
}
