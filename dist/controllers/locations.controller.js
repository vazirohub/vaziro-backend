"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationsController = void 0;
const prisma_1 = require("../lib/prisma");
class LocationsController {
    static async getStates(req, res, next) {
        try {
            const { all } = req.query;
            const states = await prisma_1.prisma.state.findMany({
                where: all === 'true' ? {} : { isActive: true },
                orderBy: { name: 'asc' },
            });
            return res.status(200).json({ success: true, data: states });
        }
        catch (error) {
            next(error);
        }
    }
    static async getCities(req, res, next) {
        try {
            const targetStateId = req.query.stateId || req.params.stateId;
            const { all } = req.query;
            const cities = await prisma_1.prisma.city.findMany({
                where: {
                    ...(all === 'true' ? {} : { isActive: true }),
                    ...(targetStateId ? { stateId: String(targetStateId) } : {}),
                },
                include: { state: true },
                orderBy: { name: 'asc' },
            });
            return res.status(200).json({ success: true, data: cities });
        }
        catch (error) {
            next(error);
        }
    }
    static async getAreas(req, res, next) {
        try {
            const { cityId } = req.query;
            const areas = await prisma_1.prisma.area.findMany({
                where: {
                    isActive: true,
                    ...(cityId ? { cityId: String(cityId) } : {}),
                },
                include: { pincodes: { where: { isActive: true } } },
                orderBy: { name: 'asc' },
            });
            return res.status(200).json({ success: true, data: areas });
        }
        catch (error) {
            next(error);
        }
    }
    static async getPincodes(req, res, next) {
        try {
            const { search } = req.query;
            const pincodes = await prisma_1.prisma.pincode.findMany({
                where: {
                    isActive: true,
                    ...(search ? { pincode: { startsWith: String(search) } } : {}),
                },
                include: {
                    area: {
                        include: {
                            city: {
                                include: { state: true },
                            },
                        },
                    },
                },
                take: 20,
            });
            return res.status(200).json({ success: true, data: pincodes });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.LocationsController = LocationsController;
