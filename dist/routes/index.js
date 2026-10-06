"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const categories_routes_1 = __importDefault(require("./categories.routes"));
const locations_routes_1 = __importDefault(require("./locations.routes"));
const health_routes_1 = __importDefault(require("./health.routes"));
const requirements_routes_1 = __importDefault(require("./requirements.routes"));
const credits_routes_1 = __importDefault(require("./credits.routes"));
const quotations_routes_1 = __importDefault(require("./quotations.routes"));
const professionals_routes_1 = __importDefault(require("./professionals.routes"));
const jobs_routes_1 = __importDefault(require("./jobs.routes"));
const chat_routes_1 = __importDefault(require("./chat.routes"));
const calls_routes_1 = __importDefault(require("./calls.routes"));
const payments_routes_1 = __importDefault(require("./payments.routes"));
const disputes_routes_1 = __importDefault(require("./disputes.routes"));
const reviews_routes_1 = __importDefault(require("./reviews.routes"));
const admin_routes_1 = __importDefault(require("./admin.routes"));
const boost_routes_1 = __importDefault(require("./boost.routes"));
const notifications_routes_1 = __importDefault(require("./notifications.routes"));
const ai_routes_1 = __importDefault(require("./ai.routes"));
const conversations_routes_1 = __importStar(require("./conversations.routes"));
const router = (0, express_1.Router)();
router.use('/health', health_routes_1.default);
router.use('/auth', auth_routes_1.default);
router.use('/ai', ai_routes_1.default);
router.use('/notifications', notifications_routes_1.default);
router.use('/categories', categories_routes_1.default);
router.use('/locations', locations_routes_1.default);
router.use('/requirements', requirements_routes_1.default);
router.use('/credits', credits_routes_1.default);
router.use('/quotations', quotations_routes_1.default);
router.use('/professionals', professionals_routes_1.default);
router.use('/jobs', jobs_routes_1.default);
router.use('/conversations', conversations_routes_1.default);
router.use('/call-requests', conversations_routes_1.callRequestsRouter);
router.use('/chat', chat_routes_1.default);
router.use('/calls', calls_routes_1.default);
router.use('/payments', payments_routes_1.default);
router.use('/disputes', disputes_routes_1.default);
router.use('/reviews', reviews_routes_1.default);
router.use('/admin', admin_routes_1.default);
router.use('/boost', boost_routes_1.default);
exports.default = router;
