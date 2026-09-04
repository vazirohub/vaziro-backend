import { Router } from 'express';
import authRoutes from './auth.routes';
import categoriesRoutes from './categories.routes';
import locationsRoutes from './locations.routes';
import healthRoutes from './health.routes';
import requirementsRoutes from './requirements.routes';
import creditsRoutes from './credits.routes';
import quotationsRoutes from './quotations.routes';
import professionalsRoutes from './professionals.routes';
import jobsRoutes from './jobs.routes';
import chatRoutes from './chat.routes';
import callsRoutes from './calls.routes';
import paymentsRoutes from './payments.routes';
import disputesRoutes from './disputes.routes';
import reviewsRoutes from './reviews.routes';
import adminRoutes from './admin.routes';
import boostRoutes from './boost.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/categories', categoriesRoutes);
router.use('/locations', locationsRoutes);
router.use('/requirements', requirementsRoutes);
router.use('/credits', creditsRoutes);
router.use('/quotations', quotationsRoutes);
router.use('/professionals', professionalsRoutes);
router.use('/jobs', jobsRoutes);
router.use('/chat', chatRoutes);
router.use('/calls', callsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/disputes', disputesRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/admin', adminRoutes);
router.use('/boost', boostRoutes);

export default router;
