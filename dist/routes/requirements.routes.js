"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requirements_controller_1 = require("../controllers/requirements.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Public discovery & listing
router.get('/', requirements_controller_1.RequirementsController.listRequirements);
router.get('/my', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('CUSTOMER', 'ADMIN', 'SUPER_ADMIN'), requirements_controller_1.RequirementsController.getMyRequirements);
router.get('/:id', requirements_controller_1.RequirementsController.getRequirementById);
// Posting & state update
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('CUSTOMER', 'ADMIN', 'SUPER_ADMIN'), requirements_controller_1.RequirementsController.createRequirement);
router.patch('/:id/status', auth_middleware_1.authenticate, requirements_controller_1.RequirementsController.updateStatus);
exports.default = router;
