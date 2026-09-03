import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/otp/request', AuthController.requestOtp);
router.post('/otp/verify', AuthController.verifyOtp);
router.post('/login', AuthController.login);
router.get('/me', authenticate, AuthController.getMe);

export default router;
