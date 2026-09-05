import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import apiRoutes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { ensureDatabaseSchema } from './lib/auto-migrate';

const app = express();

// Ensure DB schema is in sync on server initialization (non-blocking)
ensureDatabaseSchema().catch(() => {});

// Serve static public assets (logos, icons)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));


// CORS Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or matching origin
      callback(null, true);
    },
    credentials: true,
    maxAge: 86400, // Cache preflight OPTIONS for 24 hours to cut network latency in half
  })
);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Request Parsers (capturing rawBody buffer for Razorpay cryptographic webhook verification)
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiting (300 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests from this IP, please try again after 15 minutes.',
    },
  },
});
app.use('/api', limiter);

// API Version 1 Routes
app.use('/api/v1', apiRoutes);

// Compatibility alias for payments endpoints & webhooks: /api/payments/...
app.use('/api', apiRoutes);

// 404 Route Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `The requested path ${req.originalUrl} was not found on this server.`,
    },
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

export default app;
