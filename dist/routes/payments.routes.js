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
router.post('/webhook', payments_controller_1.PaymentsController.handleWebhook);
router.post('/:jobId/release', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.releasePayment);
router.get('/invoice/:jobId', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.getInvoice);
exports.default = router;
