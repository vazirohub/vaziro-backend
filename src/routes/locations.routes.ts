import { Router } from 'express';
import { LocationsController } from '../controllers/locations.controller';

const router = Router();

router.get('/states', LocationsController.getStates);
router.get('/cities', LocationsController.getCities);
router.get('/areas', LocationsController.getAreas);
router.get('/pincodes', LocationsController.getPincodes);

export default router;
