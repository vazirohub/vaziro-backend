"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthenticate = exports.requireRoles = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_REQUIRED',
                    message: 'Access token required for this endpoint.',
                },
            });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            include: {
                roles: {
                    include: { role: true },
                },
            },
        });
        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_ACCOUNT',
                    message: 'User account is inactive, suspended, or does not exist.',
                },
            });
        }
        req.user = {
            id: user.id,
            phone: user.phone,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles.map((ur) => ur.role.name),
        };
        next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'TOKEN_EXPIRED_OR_INVALID',
                message: 'The provided authentication token is invalid or has expired.',
            },
        });
    }
};
exports.authenticate = authenticate;
const requireRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'AUTH_REQUIRED',
                    message: 'Authentication is required.',
                },
            });
        }
        const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
        if (!hasRole && !req.user.roles.includes('SUPER_ADMIN')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: `Access denied. Requires one of: ${allowedRoles.join(', ')}`,
                },
            });
        }
        next();
    };
};
exports.requireRoles = requireRoles;
const optionalAuthenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: decoded.userId },
                include: { roles: { include: { role: true } } },
            });
            if (user && user.status === 'ACTIVE') {
                req.user = {
                    id: user.id,
                    phone: user.phone,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    roles: user.roles.map((ur) => ur.role.name),
                };
            }
        }
    }
    catch (ignored) {
        // Non-blocking fallback for optional auth
    }
    next();
};
exports.optionalAuthenticate = optionalAuthenticate;
