import { Router } from 'express';
import { PaymentsController } from '../controllers/payments.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Order creation & completion
router.get('/config', PaymentsController.getConfig);
router.post('/create-order', authenticate, PaymentsController.createOrder);
router.post('/verify-payment', authenticate, PaymentsController.verifyPayment);
router.post('/webhook', PaymentsController.handleWebhook);
router.post('/:jobId/release', authenticate, PaymentsController.releasePayment);
router.get('/invoice/:jobId', authenticate, PaymentsController.getInvoice);

export default router;
