import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export class LocationsController {
  static async getStates(req: Request, res: Response, next: NextFunction) {
    try {
      const { all } = req.query;
      const states = await prisma.state.findMany({
        where: all === 'true' ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      });
      return res.status(200).json({ success: true, data: states });
    } catch (error) {
      next(error);
    }
  }

  static async getCities(req: Request, res: Response, next: NextFunction) {
    try {
      const { stateId, all } = req.query;
      const cities = await prisma.city.findMany({
        where: {
          ...(all === 'true' ? {} : { isActive: true }),
          ...(stateId ? { stateId: String(stateId) } : {}),
        },
        include: { state: true },
        orderBy: { name: 'asc' },
      });
      return res.status(200).json({ success: true, data: cities });
    } catch (error) {
      next(error);
    }
  }

  static async getAreas(req: Request, res: Response, next: NextFunction) {
    try {
      const { cityId } = req.query;
      const areas = await prisma.area.findMany({
        where: {
          isActive: true,
          ...(cityId ? { cityId: String(cityId) } : {}),
        },
        include: { pincodes: { where: { isActive: true } } },
        orderBy: { name: 'asc' },
      });
      return res.status(200).json({ success: true, data: areas });
    } catch (error) {
      next(error);
    }
  }

  static async getPincodes(req: Request, res: Response, next: NextFunction) {
    try {
      const { search } = req.query;
      const pincodes = await prisma.pincode.findMany({
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
    } catch (error) {
      next(error);
    }
  }
}
