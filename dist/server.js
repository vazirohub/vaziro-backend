"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const prisma_1 = require("./lib/prisma");
const server = app_1.default.listen(config_1.config.port, () => {
    console.log(`🚀 Vaziro API Server running on port ${config_1.config.port} in ${config_1.config.nodeEnv} mode`);
    console.log(`🇮🇳 Market: India | Currency: INR (₹) | Timezone: Asia/Kolkata`);
});
server.keepAliveTimeout = 5000;
server.headersTimeout = 6000;
const gracefulShutdown = async (signal) => {
    console.log(`${signal} signal received: closing HTTP server and terminating process gracefully`);
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
