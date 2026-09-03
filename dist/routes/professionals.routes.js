"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const professionals_controller_1 = require("../controllers/professionals.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Professional profile management
router.get('/me', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), professionals_controller_1.ProfessionalsController.getMyProfile);
router.put('/me', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), professionals_controller_1.ProfessionalsController.updateProfile);
router.post('/verify/digilocker', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), professionals_controller_1.ProfessionalsController.verifyDigiLocker);
// Public profile view
router.get('/:id', professionals_controller_1.ProfessionalsController.getPublicProfile);
exports.default = router;
