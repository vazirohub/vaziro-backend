import { Router } from 'express';
import { QuotationsController } from '../controllers/quotations.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Professional apply & quote
router.post('/apply', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), QuotationsController.submitQuotation);
router.get('/my', authenticate, requireRoles('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), QuotationsController.getMyQuotations);

// Customer view & management
router.get('/requirement/:requirementId', authenticate, QuotationsController.getQuotationsForRequirement);
router.patch('/:id/shortlist', authenticate, QuotationsController.shortlistQuotation);
router.patch('/:id/reject', authenticate, QuotationsController.rejectQuotation);

export default router;
