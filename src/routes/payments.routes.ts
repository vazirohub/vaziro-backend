import { Router } from 'express';
import { PaymentsController } from '../controllers/payments.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Order creation & completion
router.get('/config', PaymentsController.getConfig);
router.post('/create-order', authenticate, PaymentsController.createOrder);
router.post('/verify-payment', authenticate, PaymentsController.verifyPayment);
router.post('/verify', authenticate, PaymentsController.verifyPayment); // Master prompt standard endpoint

// Razorpay Webhooks (supports both /webhook and /razorpay/webhook)
router.post('/webhook', PaymentsController.handleWebhook);
router.post('/razorpay/webhook', PaymentsController.handleWebhook);

// Admin Payments Ledger
router.get('/transactions', authenticate, requireRoles('ADMIN', 'SUPER_ADMIN'), PaymentsController.getTransactions);

// Escrow Release & Invoicing
router.post('/:jobId/release', authenticate, PaymentsController.releasePayment);
router.get('/invoice/:jobId', authenticate, PaymentsController.getInvoice);

export default router;
