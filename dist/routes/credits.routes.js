"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const credits_controller_1 = require("../controllers/credits.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Public plan browsing & dynamic fee calculation
router.get('/plans', credits_controller_1.CreditsController.getPlans);
router.post('/calculate-fee', credits_controller_1.CreditsController.calculateFee);
// Professional credit wallet management
router.get('/wallet', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.getWallet);
router.get('/batches', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.getBatches);
router.get('/ledger', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.getLedger);
router.get('/transactions', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.getTransactionHistory);
router.post('/purchase', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.purchasePlan);
router.post('/create-order', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.createOrder);
router.post('/verify-payment', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.verifyPayment);
router.post('/process-expired-requirements', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), credits_controller_1.CreditsController.processExpiredRequirements);
exports.default = router;
