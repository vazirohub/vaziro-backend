"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesController = void 0;
const prisma_1 = require("../lib/prisma");
class CategoriesController {
    static async getCategories(req, res, next) {
        try {
            const categories = await prisma_1.prisma.category.findMany({
                where: { isActive: true },
                include: {
                    subcategories: {
                        where: { isActive: true },
                        orderBy: { name: 'asc' },
                    },
                },
                orderBy: { name: 'asc' },
            });
            return res.status(200).json({
                success: true,
                data: categories,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getCategoryBySlug(req, res, next) {
        try {
            const { slug } = req.params;
            const category = await prisma_1.prisma.category.findUnique({
                where: { slug },
                include: {
                    subcategories: {
                        where: { isActive: true },
                    },
                },
            });
            if (!category) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'Category not found.' },
                });
            }
            return res.status(200).json({
                success: true,
                data: category,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.CategoriesController = CategoriesController;
