import { Router } from 'express';
import { CallsController } from '../controllers/calls.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/initiate', CallsController.initiateCall);
router.get('/session/:id', CallsController.getCallSession);

export default router;
