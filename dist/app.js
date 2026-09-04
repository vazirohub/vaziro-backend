"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const auto_migrate_1 = require("./lib/auto-migrate");
const app = (0, express_1.default)();
// Ensure DB schema is in sync on server initialization
(0, auto_migrate_1.ensureDatabaseSchema)().catch(() => { });
let schemaReady = false;
app.use(async (_req, _res, next) => {
    if (!schemaReady) {
        await (0, auto_migrate_1.ensureDatabaseSchema)().catch(() => { });
        schemaReady = true;
    }
    next();
});
// Security Headers
app.use((0, helmet_1.default)());
// CORS Configuration
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, postman) or matching origin
        callback(null, true);
    },
    credentials: true,
    maxAge: 86400, // Cache preflight OPTIONS for 24 hours to cut network latency in half
}));
// Logging
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('dev'));
}
// Request Parsers (capturing rawBody buffer for Razorpay cryptographic webhook verification)
app.use(express_1.default.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Global Rate Limiting (300 requests per 15 minutes per IP)
const limiter = (0, express_rate_limit_1.default)({
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
app.use('/api/v1', routes_1.default);
// Compatibility alias for payments endpoints & webhooks: /api/payments/...
app.use('/api', routes_1.default);
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
app.use(error_middleware_1.errorHandler);
exports.default = app;
