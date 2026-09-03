import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { OtpService } from '../services/otp.service';

const phoneRegex = /^\+91[6-9]\d{9}$/;

const requestOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Please provide a valid 10-digit Indian phone number with +91 country prefix.'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(phoneRegex, 'Invalid phone number format.'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits.'),
  role: z.enum(['CUSTOMER', 'PROFESSIONAL']).default('CUSTOMER'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export class AuthController {
  static async requestOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone } = requestOtpSchema.parse(req.body);
      const result = await OtpService.requestOtp(phone);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          phone,
          cooldownSeconds: result.cooldownSeconds,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone, otp, role, firstName, lastName } = verifyOtpSchema.parse(req.body);

      // Verify OTP code
      await OtpService.verifyOtp(phone, otp);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { phone },
        include: {
          roles: { include: { role: true } },
          customerProfile: true,
          professionalProfile: {
            include: { creditWallet: true, verification: true },
          },
        },
      });

      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        const targetRole = await prisma.role.findUnique({ where: { name: role } });
        if (!targetRole) {
          throw new Error(`Role ${role} is not configured.`);
        }

        user = await prisma.user.create({
          data: {
            phone,
            phoneCountryCode: '+91',
            firstName: firstName || (role === 'CUSTOMER' ? 'Customer' : 'Professional'),
            lastName: lastName || 'User',
            phoneVerifiedAt: new Date(),
            roles: {
              create: [{ roleId: targetRole.id }],
            },
            ...(role === 'CUSTOMER'
              ? {
                  customerProfile: {
                    create: { trustScore: 100.0 },
                  },
                }
              : {
                  professionalProfile: {
                    create: {
                      creditWallet: {
                        create: { balance: 0 },
                      },
                      verification: {
                        create: { status: 'NOT_STARTED' },
                      },
                    },
                  },
                }),
          },
          include: {
            roles: { include: { role: true } },
            customerProfile: true,
            professionalProfile: {
              include: { creditWallet: true, verification: true },
            },
          },
        });
      }

      // Generate JWT
      const accessToken = jwt.sign(
        { userId: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      const refreshToken = jwt.sign(
        { userId: user.id },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn as any }
      );

      // Store Refresh Token hash
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: bcrypt.hashSync(refreshToken, 8),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return res.status(200).json({
        success: true,
        message: isNewUser ? 'Account registered and authenticated successfully.' : 'Authenticated successfully.',
        data: {
          accessToken,
          refreshToken,
          isNewUser,
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles.map((r) => r.role.name),
            customerProfile: user.customerProfile,
            professionalProfile: user.professionalProfile,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          roles: { include: { role: true } },
          customerProfile: true,
          professionalProfile: {
            include: { creditWallet: true, verification: true },
          },
        },
      });

      if (!user || !user.passwordHash) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
      }

      const accessToken = jwt.sign(
        { userId: user.id },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn as any }
      );

      return res.status(200).json({
        success: true,
        message: 'Logged in successfully.',
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles.map((r) => r.role.name),
            customerProfile: user.customerProfile,
            professionalProfile: user.professionalProfile,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          roles: { include: { role: true } },
          customerProfile: true,
          professionalProfile: {
            include: { creditWallet: true, verification: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User does not exist.' },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            phone: user.phone,
            firstName: user.firstName,
            lastName: user.lastName,
            roles: user.roles.map((r) => r.role.name),
            customerProfile: user.customerProfile,
            professionalProfile: user.professionalProfile,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
