"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const quotations_controller_1 = require("../controllers/quotations.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Professional apply & quote
router.post('/apply', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), quotations_controller_1.QuotationsController.submitQuotation);
router.get('/my', auth_middleware_1.authenticate, (0, auth_middleware_1.requireRoles)('PROFESSIONAL', 'ADMIN', 'SUPER_ADMIN'), quotations_controller_1.QuotationsController.getMyQuotations);
// Customer view & management
router.get('/requirement/:requirementId', auth_middleware_1.authenticate, quotations_controller_1.QuotationsController.getQuotationsForRequirement);
router.patch('/:id/shortlist', auth_middleware_1.authenticate, quotations_controller_1.QuotationsController.shortlistQuotation);
router.patch('/:id/reject', auth_middleware_1.authenticate, quotations_controller_1.QuotationsController.rejectQuotation);
exports.default = router;
