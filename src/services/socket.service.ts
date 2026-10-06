import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';

export class SocketService {
  private static io: SocketIOServer | null = null;
  private static onlineUsers = new Map<string, Set<string>>(); // userId -> Set of socketIds

  public static init(server: HttpServer): SocketIOServer {
    if (this.io) return this.io;

    this.io = new SocketIOServer(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow all Vaziro domains and local dev
          if (!origin) return callback(null, true);
          if (
            origin.includes('vaziro.in') ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1')
          ) {
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
    this.io.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, firstName: true, lastName: true, status: true },
        });

        if (!user || user.status !== 'ACTIVE') {
          return next(new Error('User account not found or inactive'));
        }

        socket.data.user = user;
        next();
      } catch (err: any) {
        next(new Error('Authentication failed: ' + err.message));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const user = socket.data.user;
      if (!user) return;

      const userId = user.id;

      // Track online status
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(socket.id);

      // Join user's personal notifications room
      socket.join(`user:${userId}`);

      // Broadcast user online event if this is their first connection
      if (this.onlineUsers.get(userId)!.size === 1) {
        socket.broadcast.emit('user:online', { userId });
      }

      // Handle room joining with authorization verification
      socket.on('conversation:join', async ({ conversationId }: { conversationId: string }) => {
        try {
          if (!conversationId) return;

          // Verify participation in database
          const participant = await prisma.chatParticipant.findFirst({
            where: { chatThreadId: conversationId, userId },
          });

          if (!participant) {
            socket.emit('error', { message: 'Unauthorized to join conversation room' });
            return;
          }

          socket.join(`conversation:${conversationId}`);
        } catch (err) {
          // ignore error
        }
      });

      // Handle room leaving
      socket.on('conversation:leave', ({ conversationId }: { conversationId: string }) => {
        if (conversationId) {
          socket.leave(`conversation:${conversationId}`);
        }
      });

      // Handle typing indicator
      socket.on('typing:start', ({ conversationId }: { conversationId: string }) => {
        if (conversationId) {
          socket.to(`conversation:${conversationId}`).emit('typing:start', {
            conversationId,
            userId,
            userName: `${user.firstName} ${user.lastName}`.trim(),
          });
        }
      });

      socket.on('typing:stop', ({ conversationId }: { conversationId: string }) => {
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

  public static getIO(): SocketIOServer | null {
    return this.io;
  }

  public static isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId) && (this.onlineUsers.get(userId)?.size ?? 0) > 0;
  }

  public static emitToConversation(conversationId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`conversation:${conversationId}`).emit(event, data);
    }
  }

  public static emitToUser(userId: string, event: string, data: any): void {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }
}
