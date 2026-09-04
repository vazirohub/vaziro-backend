"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jobs_controller_1 = require("../controllers/jobs.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Atomic hire
router.post('/hire', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('CUSTOMER', 'ADMIN', 'SUPER_ADMIN'), jobs_controller_1.JobsController.hire);
// List my jobs
router.get('/', auth_middleware_1.authenticate, jobs_controller_1.JobsController.getMyJobs);
// Job details & status advancement
router.get('/:id', auth_middleware_1.authenticate, jobs_controller_1.JobsController.getJobDetails);
router.patch('/:id/status', auth_middleware_1.authenticate, jobs_controller_1.JobsController.updateStatus);
router.patch('/:id/work-status', auth_middleware_1.authenticate, jobs_controller_1.JobsController.updateWorkStatus);
router.post('/:id/confirm-completion', auth_middleware_1.authenticate, jobs_controller_1.JobsController.confirmCompletion);
router.post('/:id/dispute', auth_middleware_1.authenticate, jobs_controller_1.JobsController.raiseDispute);
exports.default = router;
