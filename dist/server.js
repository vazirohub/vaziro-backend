"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const prisma_1 = require("./lib/prisma");
const socket_service_1 = require("./services/socket.service");
const server = http_1.default.createServer(app_1.default);
socket_service_1.SocketService.init(server);
server.listen(config_1.config.port, () => {
    console.log(`🚀 Vaziro API Server running on port ${config_1.config.port} in ${config_1.config.nodeEnv} mode`);
    console.log(`🇮🇳 Market: India | Currency: INR (₹) | Timezone: Asia/Kolkata`);
    console.log(`⚡ Real-Time Socket.IO engine attached & active`);
});
// Hostinger optimization: Close idle connections quickly to avoid process exhaustion
server.keepAliveTimeout = 5000;
server.headersTimeout = 6000;
const gracefulShutdown = async (signal) => {
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
            await prisma_1.prisma.$disconnect();
        }
        catch (e) { }
        process.exit(0);
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
exports.default = server;
