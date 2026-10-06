"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const prisma_1 = require("../lib/prisma");
class SocketService {
    static io = null;
    static onlineUsers = new Map(); // userId -> Set of socketIds
    static init(server) {
        if (this.io)
            return this.io;
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: (origin, callback) => {
                    // Allow all Vaziro domains and local dev
                    if (!origin)
                        return callback(null, true);
                    if (origin.includes('vaziro.in') ||
                        origin.includes('localhost') ||
                        origin.includes('127.0.0.1')) {
                        return callback(null, true);
                    }
                    return callback(null, false);
                },
                credentials: true,
            },
            pingTimeout: 30000,
            pingInterval: 15000,
        });
        // Authentication Middleware
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.replace('Bearer ', '');
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
                const user = await prisma_1.prisma.user.findUnique({
                    where: { id: decoded.userId },
                    select: { id: true, firstName: true, lastName: true, status: true },
                });
                if (!user || user.status !== 'ACTIVE') {
                    return next(new Error('User account not found or inactive'));
                }
                socket.data.user = user;
                next();
            }
            catch (err) {
                next(new Error('Authentication failed: ' + err.message));
            }
        });
        this.io.on('connection', (socket) => {
            const user = socket.data.user;
            if (!user)
                return;
            const userId = user.id;
            // Track online status
            if (!this.onlineUsers.has(userId)) {
                this.onlineUsers.set(userId, new Set());
            }
            this.onlineUsers.get(userId).add(socket.id);
            // Join user's personal notifications room
            socket.join(`user:${userId}`);
            // Broadcast user online event if this is their first connection
            if (this.onlineUsers.get(userId).size === 1) {
                socket.broadcast.emit('user:online', { userId });
            }
            // Handle room joining with authorization verification
            socket.on('conversation:join', async ({ conversationId }) => {
                try {
                    if (!conversationId)
                        return;
                    // Verify participation in database
                    const participant = await prisma_1.prisma.chatParticipant.findFirst({
                        where: { chatThreadId: conversationId, userId },
                    });
                    if (!participant) {
                        socket.emit('error', { message: 'Unauthorized to join conversation room' });
                        return;
                    }
                    socket.join(`conversation:${conversationId}`);
                }
                catch (err) {
                    // ignore error
                }
            });
            // Handle room leaving
            socket.on('conversation:leave', ({ conversationId }) => {
                if (conversationId) {
                    socket.leave(`conversation:${conversationId}`);
                }
            });
            // Handle typing indicator
            socket.on('typing:start', ({ conversationId }) => {
                if (conversationId) {
                    socket.to(`conversation:${conversationId}`).emit('typing:start', {
                        conversationId,
                        userId,
                        userName: `${user.firstName} ${user.lastName}`.trim(),
                    });
                }
            });
            socket.on('typing:stop', ({ conversationId }) => {
                if (conversationId) {
                    socket.to(`conversation:${conversationId}`).emit('typing:stop', {
                        conversationId,
                        userId,
                    });
                }
            });
            // Disconnect handling
            socket.on('disconnect', () => {
                const userSockets = this.onlineUsers.get(userId);
                if (userSockets) {
                    userSockets.delete(socket.id);
                    if (userSockets.size === 0) {
                        this.onlineUsers.delete(userId);
                        socket.broadcast.emit('user:offline', { userId });
                    }
                }
            });
        });
        return this.io;
    }
    static getIO() {
        return this.io;
    }
    static isUserOnline(userId) {
        return this.onlineUsers.has(userId) && (this.onlineUsers.get(userId)?.size ?? 0) > 0;
    }
    static emitToConversation(conversationId, event, data) {
        if (this.io) {
            this.io.to(`conversation:${conversationId}`).emit(event, data);
        }
    }
    static emitToUser(userId, event, data) {
        if (this.io) {
            this.io.to(`user:${userId}`).emit(event, data);
        }
    }
}
exports.SocketService = SocketService;
