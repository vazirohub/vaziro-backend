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
// Users & Credits Full Control (Bulk Actions & Single Controls)
router.post('/users/bulk-action', admin_controller_1.AdminController.bulkUsersAction);
router.get('/users', admin_controller_1.AdminController.getUsers);
router.put('/users/:id', admin_controller_1.AdminController.updateUser);
router.delete('/users/:id', admin_controller_1.AdminController.deleteUser);
router.patch('/users/:id/status', admin_controller_1.AdminController.updateUserStatus);
router.post('/users/:id/credits', admin_controller_1.AdminController.adjustUserCredits);
router.post('/users/:id/reset-password', admin_controller_1.AdminController.resetUserPassword);
// Marketplace Requirements & Jobs Control (Bulk Actions & Single Controls)
router.post('/requirements/bulk-action', admin_controller_1.AdminController.bulkRequirementsAction);
router.get('/requirements', admin_controller_1.AdminController.getRequirements);
router.patch('/requirements/:id/status', admin_controller_1.AdminController.updateRequirementStatus);
router.post('/jobs/bulk-action', admin_controller_1.AdminController.bulkJobsAction);
router.get('/jobs', admin_controller_1.AdminController.getJobs);
router.patch('/jobs/:id/status', admin_controller_1.AdminController.updateJobStatus);
// Verifications, Settings & Locations (Bulk Actions & Single Controls)
router.post('/verifications/bulk-action', admin_controller_1.AdminController.bulkVerificationsAction);
router.get('/verifications', admin_controller_1.AdminController.getVerifications);
router.get('/verifications/:id', admin_controller_1.AdminController.getVerificationById);
router.post('/verifications/:id/review', admin_controller_1.AdminController.markForReview);
router.post('/verifications/:id/override', admin_controller_1.AdminController.adminOverride);
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
// Communication Moderation & Reports (Bulk Actions & Single Controls)
router.post('/reports/bulk-action', admin_controller_1.AdminController.bulkReportsAction);
router.get('/reports', admin_controller_1.AdminController.getReports);
router.get('/reports/:id', admin_controller_1.AdminController.getReportById);
router.post('/reports/:id/resolve', admin_controller_1.AdminController.resolveReport);
exports.default = router;
