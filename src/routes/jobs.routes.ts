import { Router } from 'express';
import { JobsController } from '../controllers/jobs.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Atomic hire
router.post('/hire', authenticate, requireRoles('CUSTOMER', 'ADMIN', 'SUPER_ADMIN'), JobsController.hire);

// List my jobs
router.get('/', authenticate, JobsController.getMyJobs);

// Job details & status advancement
router.get('/:id', authenticate, JobsController.getJobDetails);
router.patch('/:id/status', authenticate, JobsController.updateStatus);
router.patch('/:id/work-status', authenticate, JobsController.updateWorkStatus);
router.post('/:id/confirm-completion', authenticate, JobsController.confirmCompletion);
router.post('/:id/dispute', authenticate, JobsController.raiseDispute);

export default router;
