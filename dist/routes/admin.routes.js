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
// Categories & Subcategories Governance
router.post('/categories', admin_controller_1.AdminController.createCategory);
router.put('/categories/:id', admin_controller_1.AdminController.updateCategory);
router.delete('/categories/:id', admin_controller_1.AdminController.deleteCategory);
router.post('/subcategories', admin_controller_1.AdminController.createSubcategory);
router.put('/subcategories/:id', admin_controller_1.AdminController.updateSubcategory);
router.delete('/subcategories/:id', admin_controller_1.AdminController.deleteSubcategory);
// Professional Plans Governance (Section 13, 14)
router.get('/plans', admin_controller_1.AdminController.getPlans);
router.post('/plans', admin_controller_1.AdminController.createPlan);
router.put('/plans/:id', admin_controller_1.AdminController.updatePlan);
// Customer Boost Packages Governance (Section 25)
router.get('/boost-packages', admin_controller_1.AdminController.getBoostPackages);
router.post('/boost-packages', admin_controller_1.AdminController.createBoostPackage);
router.put('/boost-packages/:id', admin_controller_1.AdminController.updateBoostPackage);
// Credit Batches & Audit Ledger (Section 18, 20, 117)
router.get('/credits/batches', admin_controller_1.AdminController.getCreditBatches);
router.get('/credits/ledger', admin_controller_1.AdminController.getCreditLedger);
router.post('/credits/process-expired', admin_controller_1.AdminController.triggerBatchExpiry);
exports.default = router;
