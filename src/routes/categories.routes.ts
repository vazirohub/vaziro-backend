import { Router } from 'express';
import { CategoriesController } from '../controllers/categories.controller';

const router = Router();

router.get('/', CategoriesController.getCategories);
router.get('/:slug', CategoriesController.getCategoryBySlug);

export default router;
