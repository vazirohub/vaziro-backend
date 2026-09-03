"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Restrict entire admin namespace to admin roles
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'));
router.get('/metrics', admin_controller_1.AdminController.getMetrics);
router.get('/users', admin_controller_1.AdminController.getUsers);
router.patch('/users/:id/status', admin_controller_1.AdminController.updateUserStatus);
router.get('/verifications', admin_controller_1.AdminController.getVerifications);
router.patch('/verifications/:id', admin_controller_1.AdminController.reviewVerification);
router.get('/settings', admin_controller_1.AdminController.getSettings);
router.put('/settings', admin_controller_1.AdminController.updateSetting);
router.patch('/locations/toggle', admin_controller_1.AdminController.toggleLocation);
exports.default = router;
