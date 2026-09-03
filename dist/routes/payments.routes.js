"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payments_controller_1 = require("../controllers/payments.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Order creation & completion
router.post('/create-order', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.createOrder);
router.post('/webhook', payments_controller_1.PaymentsController.handleWebhook);
router.post('/:jobId/release', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.releasePayment);
router.get('/invoice/:jobId', auth_middleware_1.authenticate, payments_controller_1.PaymentsController.getInvoice);
exports.default = router;
