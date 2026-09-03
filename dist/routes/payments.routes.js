"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payments_controller_1 = require("../controllers/payments.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Order creation & completion
router.get('/config', payments_controller_1.PaymentsController.getConfig);
router.post('/create-order', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.createOrder);
router.post('/verify-payment', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.verifyPayment);
router.post('/verify', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.verifyPayment); // Master prompt standard endpoint
// Razorpay Webhooks (supports both /webhook and /razorpay/webhook)
router.post('/webhook', payments_controller_1.PaymentsController.handleWebhook);
router.post('/razorpay/webhook', payments_controller_1.PaymentsController.handleWebhook);
// Admin Payments Ledger
router.get('/transactions', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), payments_controller_1.PaymentsController.getTransactions);
// Escrow Release & Invoicing
router.post('/:jobId/release', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.releasePayment);
router.get('/invoice/:jobId', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.getInvoice);
exports.default = router;
