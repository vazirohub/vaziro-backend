import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

// Restrict entire admin namespace to admin roles
router.use(authenticate, requireRoles('ADMIN', 'SUPER_ADMIN'));

// Platform Metrics
router.get('/metrics', AdminController.getMetrics);

// Users & Credits Full Control
router.get('/users', AdminController.getUsers);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);
router.patch('/users/:id/status', AdminController.updateUserStatus);
router.post('/users/:id/credits', AdminController.adjustUserCredits);
router.post('/users/:id/reset-password', AdminController.resetUserPassword);

// Marketplace Requirements & Jobs Control
router.get('/requirements', AdminController.getRequirements);
router.patch('/requirements/:id/status', AdminController.updateRequirementStatus);
router.get('/jobs', AdminController.getJobs);
router.patch('/jobs/:id/status', AdminController.updateJobStatus);

// Verifications, Settings & Locations
router.get('/verifications', AdminController.getVerifications);
router.patch('/verifications/:id', AdminController.reviewVerification);
router.get('/settings', AdminController.getSettings);
router.put('/settings', AdminController.updateSetting);
router.get('/locations', AdminController.getAllLocations);
router.patch('/locations/toggle', AdminController.toggleLocation);

// Categories & Subcategories Governance
router.post('/categories', AdminController.createCategory);
router.put('/categories/:id', AdminController.updateCategory);
router.delete('/categories/:id', AdminController.deleteCategory);
router.post('/subcategories', AdminController.createSubcategory);
router.put('/subcategories/:id', AdminController.updateSubcategory);
router.delete('/subcategories/:id', AdminController.deleteSubcategory);

// Professional Plans Governance (Section 13, 14)
router.get('/plans', AdminController.getPlans);
router.post('/plans', AdminController.createPlan);
router.put('/plans/:id', AdminController.updatePlan);

// Customer Boost Packages Governance (Section 25)
router.get('/boost-packages', AdminController.getBoostPackages);
router.post('/boost-packages', AdminController.createBoostPackage);
router.put('/boost-packages/:id', AdminController.updateBoostPackage);

// Credit Batches & Audit Ledger (Section 18, 20, 117)
router.get('/credits/batches', AdminController.getCreditBatches);
router.get('/credits/ledger', AdminController.getCreditLedger);
router.post('/credits/process-expired', AdminController.triggerBatchExpiry);

export default router;
