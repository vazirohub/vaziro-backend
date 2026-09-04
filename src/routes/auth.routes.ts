import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Dedicated Mobile + MSG91 OTP Authentication Routes
router.post('/check-mobile', AuthController.checkMobile);
router.post('/send-otp', AuthController.sendOtp);
router.post('/resend-otp', AuthController.resendOtp);
router.post('/verify-otp', AuthController.verifyOtp);
router.post('/complete-signup', AuthController.completeSignup);

// Compatibility aliases
router.post('/otp/request', AuthController.sendOtp);
router.post('/otp/verify', AuthController.verifyOtp);
router.get('/user-exists', AuthController.checkUserExists);

router.post('/login', AuthController.login);
router.post('/register', AuthController.register);
router.get('/me', authenticate, AuthController.getMe);
router.put('/profile', authenticate, AuthController.updateProfile);
router.put('/password', authenticate, AuthController.changePassword);
router.post('/logout', AuthController.logout);

export default router;
