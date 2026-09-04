"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const boost_controller_1 = require("../controllers/boost.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// Publicly visible boost packages
router.get('/packages', boost_controller_1.BoostController.getPackages);
// Customer requirement boost purchase & verification
router.post('/create-order', auth_middleware_1.authenticate, boost_controller_1.BoostController.createOrder);
router.post('/verify-payment', auth_middleware_1.authenticate, boost_controller_1.BoostController.verifyPayment);
// Requirement boost status
router.get('/requirement/:requirementId', boost_controller_1.BoostController.getRequirementBoost);
exports.default = router;
