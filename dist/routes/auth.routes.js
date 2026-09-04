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
// Compatibility aliases
router.post('/otp/request', auth_controller_1.AuthController.sendOtp);
router.post('/otp/verify', auth_controller_1.AuthController.verifyOtp);
router.get('/user-exists', auth_controller_1.AuthController.checkUserExists);
router.post('/login', auth_controller_1.AuthController.login);
router.post('/register', auth_controller_1.AuthController.register);
router.get('/me', auth_middleware_1.authenticate, auth_controller_1.AuthController.getMe);
router.put('/profile', auth_middleware_1.authenticate, auth_controller_1.AuthController.updateProfile);
router.put('/password', auth_middleware_1.authenticate, auth_controller_1.AuthController.changePassword);
router.post('/logout', auth_controller_1.AuthController.logout);
exports.default = router;
