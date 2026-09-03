"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const zod_1 = require("zod");
const errorHandler = (err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
next) => {
    let statusCode = err.statusCode || 500;
    let code = err.code || 'INTERNAL_ERROR';
    let message = err.message || 'An unexpected internal server error occurred.';
    let details = err.details || {};
    if (err instanceof zod_1.ZodError) {
        statusCode = 422;
        code = 'VALIDATION_ERROR';
        message = 'Request validation failed.';
        details = err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
        }));
    }
    if (process.env.NODE_ENV === 'development' && statusCode === 500) {
        console.error('💥 Unhandled Error:', err);
    }
    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
            details,
        },
    });
};
exports.errorHandler = errorHandler;
