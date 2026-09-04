import { Router } from 'express';
import { RequirementsController } from '../controllers/requirements.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Public discovery & listing
router.get('/', RequirementsController.listRequirements);
router.get('/my', authenticate, requireRoles('CUSTOMER', 'ADMIN', 'SUPER_ADMIN'), RequirementsController.getMyRequirements);
router.get('/:id', RequirementsController.getRequirementById);

// Posting & state update
router.post('/', authenticate, requireRoles('CUSTOMER', 'ADMIN', 'SUPER_ADMIN'), RequirementsController.createRequirement);
router.patch('/:id/status', authenticate, RequirementsController.updateStatus);
router.delete('/:id', authenticate, RequirementsController.deleteRequirement);

export default router;
