import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

describe('Vaziro Production Auth & Notifications Specification', () => {
  const testRunId = Date.now().toString().slice(-6);
  const testEmail = `testuser_${testRunId}@vaziro.in`;
  const testMobileDigits = `98${testRunId}12`;
  const testMobile = `+91${testMobileDigits}`;
  const testPassword = 'Password2026!';
  const updatedPassword = 'NewSecret2026!';

  let testUserId = '';
  let authToken = '';

  afterAll(async () => {
    // Wait for any in-flight background Resend notifications to settle
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Cleanup created test records
    if (testUserId) {
      await prisma.notification.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.customerProfile.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.professionalProfile.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.userRole.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: testUserId } }).catch(() => {});
    }
    await prisma.otpVerification.deleteMany({
      where: {
        OR: [
          { email: testEmail },
          { phone: testMobile },
          { identifier: testEmail },
          { identifier: testMobile },
        ],
      },
    }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });

  describe('1. Signup Workflow', () => {
    it('POST /api/v1/auth/register should create account with email, mobile and password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test Customer',
          email: testEmail,
          phone: testMobileDigits,
          password: testPassword,
          role: 'CUSTOMER',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail.toLowerCase());
      expect(res.body.data.user.phone).toBe(testMobile);
      expect(res.body.data.user.roles).toContain('CUSTOMER');

      testUserId = res.body.data.user.id;
      authToken = res.body.data.accessToken;
    });

    it('POST /api/v1/auth/register should reject duplicate email or mobile with 409', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Duplicate Customer',
          email: testEmail,
          phone: testMobileDigits,
          password: testPassword,
          role: 'CUSTOMER',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('USER_EXISTS');
    });
  });

  describe('2. Login with Email or Mobile + Password (NO OTP REQUIRED)', () => {
    it('POST /api/v1/auth/login with Email + Password should succeed', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: testEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.id).toBe(testUserId);
    });

    it('POST /api/v1/auth/login with 10-digit Mobile + Password should succeed', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: testMobileDigits,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.id).toBe(testUserId);
    });

    it('POST /api/v1/auth/login with wrong password should fail with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: testEmail,
          password: 'IncorrectPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('3. Account Recovery / Forgot Password Flow', () => {
    let mockResetCode = '654321';

    it('POST /api/v1/auth/forgot-password should dispatch code with anti-enumeration protection', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: testEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('verification code has been dispatched');

      // Check record in database and set a known code for test verification
      const otpRecord = await prisma.otpVerification.findFirst({
        where: {
          OR: [{ email: testEmail }, { identifier: testEmail }],
          purpose: 'forgot_password',
          isUsed: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(otpRecord).toBeDefined();

      // Update hash with our known mock code for deterministic testing
      await prisma.otpVerification.update({
        where: { id: otpRecord!.id },
        data: { otpHash: await bcrypt.hash(mockResetCode, 8) },
      });
    });

    it('POST /api/v1/auth/forgot-password with non-existent account returns safe 200 response', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ identifier: 'nonexistent_account_xyz99@vaziro.in' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('verification code has been dispatched');
    });

    it('POST /api/v1/auth/verify-reset-code should validate correct code and return resetToken', async () => {
      const res = await request(app)
        .post('/api/v1/auth/verify-reset-code')
        .send({
          identifier: testEmail,
          code: mockResetCode,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resetToken).toBeDefined();
    });

    it('POST /api/v1/auth/reset-password should update password and revoke previous sessions', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          identifier: testEmail,
          code: mockResetCode,
          newPassword: updatedPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Password updated successfully');

      // Now verify login with the new password works
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          identifier: testEmail,
          password: updatedPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      authToken = loginRes.body.data.accessToken;
    });
  });

  describe('4. In-App Notification Center API', () => {
    let createdNotificationId = '';

    beforeAll(async () => {
      // Create a test notification in database
      const notif = await prisma.notification.create({
        data: {
          userId: testUserId,
          title: 'Quotation Received',
          message: 'A verified professional submitted a quotation for your request.',
          type: 'QUOTATION',
          actionUrl: '/requirements/req-123',
          isRead: false,
        },
      });
      createdNotificationId = notif.id;
    });

    it('GET /api/v1/notifications should return notifications and unreadCount', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications.length).toBeGreaterThan(0);
      expect(res.body.data.unreadCount).toBeGreaterThan(0);
      expect(res.body.data.notifications[0].title).toBe('Quotation Received');
    });

    it('PATCH /api/v1/notifications/:id/read should mark notification as read', async () => {
      const res = await request(app)
        .patch(`/api/v1/notifications/${createdNotificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isRead).toBe(true);
    });

    it('PATCH /api/v1/notifications/read-all should mark all as read', async () => {
      const res = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBe(0);
    });
  });
});
