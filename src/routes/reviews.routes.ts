import { Router } from 'express';
import { ReviewsController } from '../controllers/reviews.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/professional/:id', ReviewsController.getProfessionalReviews);
router.post('/', authenticate, ReviewsController.createReview);

export default router;
