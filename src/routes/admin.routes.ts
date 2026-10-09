import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Staff roles permitted to access admin workbench
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'VERIFICATION_ADMIN'];
router.use(authenticate, requireRoles(...STAFF_ROLES));

// 1. Platform Metrics (Accessible to all staff)
router.get('/metrics', AdminController.getMetrics);

// 2. Employee & Staff Management (Restricted to Operations Admin and Super Admin)
router.get('/employees', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.getEmployees);
router.post('/employees', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.createEmployee);
router.put('/employees/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.updateEmployee);
router.patch('/employees/:id/status', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.updateEmployeeStatus);
router.post('/employees/:id/reset-password', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.resetEmployeePassword);
router.delete('/employees/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.deleteEmployee);

// 3. Users & Credits Control
router.post('/users/bulk-action', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.bulkUsersAction);
router.get('/users', AdminController.getUsers);
router.put('/users/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.updateUser);
router.delete('/users/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.deleteUser);
router.patch('/users/:id/status', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.updateUserStatus);
router.post('/users/:id/credits', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.adjustUserCredits);
router.post('/users/:id/reset-password', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.resetUserPassword);

// 4. Marketplace Requirements & Jobs Control
router.post('/requirements/bulk-action', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.bulkRequirementsAction);
router.get('/requirements', AdminController.getRequirements);
router.patch('/requirements/:id/status', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.updateRequirementStatus);
router.post('/jobs/bulk-action', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.bulkJobsAction);
router.get('/jobs', AdminController.getJobs);
router.patch('/jobs/:id/status', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.updateJobStatus);

// 5. Verifications (KYC Officers, Admins & Super Admins)
router.post('/verifications/bulk-action', requireRoles('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), AdminController.bulkVerificationsAction);
router.get('/verifications', requireRoles('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), AdminController.getVerifications);
router.get('/verifications/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), AdminController.getVerificationById);
router.post('/verifications/:id/review', requireRoles('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), AdminController.markForReview);
router.post('/verifications/:id/override', requireRoles('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), AdminController.adminOverride);
router.patch('/verifications/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'VERIFICATION_ADMIN'), AdminController.reviewVerification);

// 6. Platform Settings & Locations Governance
router.get('/settings', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.getSettings);
router.put('/settings', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.updateSetting);
router.get('/locations', AdminController.getAllLocations);
router.patch('/locations/toggle', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.toggleLocation);

// 7. Categories & Subcategories Governance
router.post('/categories', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.createCategory);
router.put('/categories/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.updateCategory);
router.delete('/categories/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.deleteCategory);
router.post('/subcategories', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.createSubcategory);
router.put('/subcategories/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.updateSubcategory);
router.delete('/subcategories/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), AdminController.deleteSubcategory);

// 8. Professional Plans & Customer Boost Governance (Finance & Admins)
router.get('/plans', AdminController.getPlans);
router.post('/plans', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.createPlan);
router.put('/plans/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.updatePlan);
router.get('/boost-packages', AdminController.getBoostPackages);
router.post('/boost-packages', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.createBoostPackage);
router.put('/boost-packages/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.updateBoostPackage);

// 9. Credit Batches & Audit Ledger (Finance & Admins)
router.get('/credits/batches', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.getCreditBatches);
router.get('/credits/ledger', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.getCreditLedger);
router.post('/credits/process-expired', requireRoles('ADMIN', 'SUPER_ADMIN', 'FINANCE'), AdminController.triggerBatchExpiry);

// 10. Communication Moderation & Reports (Support Specialists & Admins)
router.post('/reports/bulk-action', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.bulkReportsAction);
router.get('/reports', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.getReports);
router.get('/reports/:id', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.getReportById);
router.post('/reports/:id/resolve', requireRoles('ADMIN', 'SUPER_ADMIN', 'SUPPORT'), AdminController.resolveReport);

export default router;
