"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Restrict entire admin namespace to admin roles
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'));
// Platform Metrics
router.get('/metrics', admin_controller_1.AdminController.getMetrics);
// Users & Credits Full Control
router.get('/users', admin_controller_1.AdminController.getUsers);
router.put('/users/:id', admin_controller_1.AdminController.updateUser);
router.delete('/users/:id', admin_controller_1.AdminController.deleteUser);
router.patch('/users/:id/status', admin_controller_1.AdminController.updateUserStatus);
router.post('/users/:id/credits', admin_controller_1.AdminController.adjustUserCredits);
router.post('/users/:id/reset-password', admin_controller_1.AdminController.resetUserPassword);
// Marketplace Requirements & Jobs Control
router.get('/requirements', admin_controller_1.AdminController.getRequirements);
router.patch('/requirements/:id/status', admin_controller_1.AdminController.updateRequirementStatus);
router.get('/jobs', admin_controller_1.AdminController.getJobs);
router.patch('/jobs/:id/status', admin_controller_1.AdminController.updateJobStatus);
// Verifications, Settings & Locations
router.get('/verifications', admin_controller_1.AdminController.getVerifications);
router.patch('/verifications/:id', admin_controller_1.AdminController.reviewVerification);
router.get('/settings', admin_controller_1.AdminController.getSettings);
router.put('/settings', admin_controller_1.AdminController.updateSetting);
router.get('/locations', admin_controller_1.AdminController.getAllLocations);
router.patch('/locations/toggle', admin_controller_1.AdminController.toggleLocation);
exports.default = router;
