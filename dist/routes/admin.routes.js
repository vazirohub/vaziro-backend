"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Staff roles permitted to access admin workbench
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
router.use(auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)(...STAFF_ROLES));
// 1. Platform Metrics (Accessible to all staff)
router.get('/metrics', admin_controller_1.AdminController.getMetrics);
// 2. Employee & Staff Management (Restricted to Operations Admin and Super Admin)
router.get('/employees', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.getEmployees);
router.post('/employees', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.createEmployee);
router.put('/employees/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.updateEmployee);
router.patch('/employees/:id/status', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.updateEmployeeStatus);
router.post('/employees/:id/reset-password', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.resetEmployeePassword);
router.delete('/employees/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.deleteEmployee);
// 3. Users & Credits Control
router.post('/users/bulk-action', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.bulkUsersAction);
router.get('/users', admin_controller_1.AdminController.getUsers);
router.put('/users/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.updateUser);
router.delete('/users/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.deleteUser);
router.patch('/users/:id/status', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.updateUserStatus);
router.post('/users/:id/credits', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.adjustUserCredits);
router.post('/users/:id/reset-password', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.resetUserPassword);
// 4. Marketplace Requirements & Jobs Control
router.post('/requirements/bulk-action', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.bulkRequirementsAction);
router.get('/requirements', admin_controller_1.AdminController.getRequirements);
router.patch('/requirements/:id/status', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.updateRequirementStatus);
router.post('/jobs/bulk-action', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.bulkJobsAction);
router.get('/jobs', admin_controller_1.AdminController.getJobs);
router.patch('/jobs/:id/status', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.updateJobStatus);
// 5. Verifications (KYC Officers, Admins & Super Admins)
router.post('/verifications/bulk-action', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), admin_controller_1.AdminController.bulkVerificationsAction);
router.get('/verifications', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), admin_controller_1.AdminController.getVerifications);
router.get('/verifications/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), admin_controller_1.AdminController.getVerificationById);
router.post('/verifications/:id/review', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), admin_controller_1.AdminController.markForReview);
router.post('/verifications/:id/override', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), admin_controller_1.AdminController.adminOverride);
router.patch('/verifications/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), admin_controller_1.AdminController.reviewVerification);
// 6. Platform Settings & Locations Governance
router.get('/settings', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.getSettings);
router.put('/settings', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.updateSetting);
router.get('/locations', admin_controller_1.AdminController.getAllLocations);
router.patch('/locations/toggle', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.toggleLocation);
// 7. Categories & Subcategories Governance
router.post('/categories', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.createCategory);
router.put('/categories/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.updateCategory);
router.delete('/categories/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.deleteCategory);
router.post('/subcategories', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.createSubcategory);
router.put('/subcategories/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.updateSubcategory);
router.delete('/subcategories/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN'), admin_controller_1.AdminController.deleteSubcategory);
// 8. Professional Plans & Customer Boost Governance (Finance & Admins)
router.get('/plans', admin_controller_1.AdminController.getPlans);
router.post('/plans', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.createPlan);
router.put('/plans/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.updatePlan);
router.get('/boost-packages', admin_controller_1.AdminController.getBoostPackages);
router.post('/boost-packages', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.createBoostPackage);
router.put('/boost-packages/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.updateBoostPackage);
// 9. Credit Batches & Audit Ledger (Finance & Admins)
router.get('/credits/batches', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.getCreditBatches);
router.get('/credits/ledger', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.getCreditLedger);
router.post('/credits/process-expired', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'FINANCE'), admin_controller_1.AdminController.triggerBatchExpiry);
// 10. Communication Moderation & Reports (Support Specialists & Admins)
router.post('/reports/bulk-action', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.bulkReportsAction);
router.get('/reports', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.getReports);
router.get('/reports/:id', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.getReportById);
router.post('/reports/:id/resolve', (0, auth_middleware_1.requireRoles)('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), admin_controller_1.AdminController.resolveReport);
exports.default = router;
