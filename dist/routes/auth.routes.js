"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Dedicated Mobile + MSG91 OTP Authentication Routes
router.post('/check-mobile', auth_controller_1.AuthController.checkMobile);
router.post('/send-otp', auth_controller_1.AuthController.sendOtp);
router.post('/resend-otp', auth_controller_1.AuthController.resendOtp);
router.post('/verify-otp', auth_controller_1.AuthController.verifyOtp);
router.post('/complete-signup', auth_controller_1.AuthController.completeSignup);
// Dedicated Email OTP Authentication & Verification Routes
router.post('/send-email-otp', auth_controller_1.AuthController.sendEmailOtp);
router.post('/verify-email-otp', auth_controller_1.AuthController.verifyEmailOtp);
// Authenticated Profile Contact Verification Routes
router.post('/profile/send-email-otp', auth_middleware_1.authenticate, auth_controller_1.AuthController.profileSendEmailOtp);
router.post('/profile/verify-email-otp', auth_middleware_1.authenticate, auth_controller_1.AuthController.profileVerifyEmailOtp);
router.post('/profile/send-mobile-otp', auth_middleware_1.authenticate, auth_controller_1.AuthController.profileSendMobileOtp);
router.post('/profile/verify-mobile-otp', auth_middleware_1.authenticate, auth_controller_1.AuthController.profileVerifyMobileOtp);
// Compatibility aliases
router.post('/otp/request', auth_controller_1.AuthController.sendOtp);
router.post('/otp/verify', auth_controller_1.AuthController.verifyOtp);
router.get('/user-exists', auth_controller_1.AuthController.checkUserExists);
router.post('/login', auth_controller_1.AuthController.login);
router.post('/register', auth_controller_1.AuthController.register);
router.post('/forgot-password', auth_controller_1.AuthController.forgotPassword);
router.post('/verify-reset-code', auth_controller_1.AuthController.verifyResetCode);
router.post('/reset-password', auth_controller_1.AuthController.resetPassword);
router.get('/me', auth_middleware_1.authenticate, auth_controller_1.AuthController.getMe);
router.put('/profile', auth_middleware_1.authenticate, auth_controller_1.AuthController.updateProfile);
router.put('/password', auth_middleware_1.authenticate, auth_controller_1.AuthController.changePassword);
router.post('/logout', auth_controller_1.AuthController.logout);
exports.default = router;
