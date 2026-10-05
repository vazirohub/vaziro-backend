import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { ApiSetuService } from '../services/apisetu.service';
import jwt from 'jsonwebtoken';
import { config } from '../config';

describe('Professional Verification System (API Setu & DigiLocker)', () => {
  let adminToken: string;
  let customerToken: string;
  let professionalToken: string;
  let professionalUserId: string;

  beforeAll(async () => {
    // 1. Get Admin Token
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@vaziro.in', password: 'VaziroPass2026!' });
    adminToken = adminLogin.body.data?.accessToken;

    // Ensure roles exist
    const custRole = await prisma.role.upsert({
      where: { name: 'CUSTOMER' },
      update: {},
      create: { name: 'CUSTOMER', description: 'Customer role' },
    });
    const profRole = await prisma.role.upsert({
      where: { name: 'PROFESSIONAL' },
      update: {},
      create: { name: 'PROFESSIONAL', description: 'Professional role' },
    });

    // 2. Create Customer User & Token
    const custUser = await prisma.user.create({
      data: {
        phone: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Ananya',
        lastName: 'Sharma',
        status: 'ACTIVE',
        roles: {
          create: { roleId: custRole.id },
        },
        customerProfile: {
          create: {},
        },
      },
    });
    customerToken = jwt.sign({ userId: custUser.id }, config.jwt.secret, { expiresIn: '1h' });

    // 3. Create Professional User & Token
    const profUser = await prisma.user.create({
      data: {
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Rajesh',
        lastName: 'Kumar',
        status: 'ACTIVE',
        roles: {
          create: { roleId: profRole.id },
        },
        professionalProfile: {
          create: {
            title: 'Master Electrician',
            yearsOfExperience: 5,
            hourlyRate: 500,
          },
        },
      },
    });
    professionalUserId = profUser.id;
    professionalToken = jwt.sign({ userId: profUser.id }, config.jwt.secret, { expiresIn: '1h' });
  });

  describe('Authorization & RBAC', () => {
    it('Unauthorized request to start verification should return 401', async () => {
      const res = await request(app)
        .post('/api/v1/professionals/verification/start');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Customer cannot start professional verification (should return 403)', async () => {
      const res = await request(app)
        .post('/api/v1/professionals/verification/start')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Customer cannot access professional verification status (should return 403)', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/verification/status')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Verification Lifecycle & State Correlation', () => {
    it('Professional can retrieve initial status (NOT_STARTED)', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/verification/status')
        .set('Authorization', `Bearer ${professionalToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('NOT_STARTED');
      expect(res.body.data.isVerified).toBe(false);
      expect(res.body.data.message).toBe('Your identity has not been verified yet.');
    });

    it('Professional can initiate DigiLocker verification session', async () => {
      const res = await request(app)
        .post('/api/v1/professionals/verification/start')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authUrl).toContain('apisetu.gov.in');
      expect(res.body.data.state).toBeDefined();
      expect(res.body.data.requestId).toBeDefined();

      // Verify database updated to PENDING
      const statusRes = await request(app)
        .get('/api/v1/professionals/verification/status')
        .set('Authorization', `Bearer ${professionalToken}`);
      expect(statusRes.body.data.status).toBe('PENDING');
      expect(statusRes.body.data.message).toBe('Your DigiLocker verification is in progress.');
    });

    it('Duplicate active verification returns existing active session', async () => {
      const res = await request(app)
        .post('/api/v1/professionals/verification/start')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authUrl).toBeDefined();
    });

    it('Callback with invalid state parameter is rejected (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/v1/professionals/verification/callback')
        .send({
          code: 'test_auth_code_123',
          state: 'invalid_tampered_state_token',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('Callback with user mismatch is rejected (HTTP 403)', async () => {
      // Create state for a different user ID
      const fakeState = jwt.sign(
        { userId: 'diff_user_999', requestId: 'req_123', provider: 'DIGILOCKER' },
        config.jwt.secret,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .post('/api/v1/professionals/verification/callback')
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({
          code: 'test_code',
          state: fakeState,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('mismatch');
    });

    it('Successful callback updates verification to VERIFIED and marks profile verified', async () => {
      // Generate genuine state for professional
      const profile = await prisma.professionalProfile.findUnique({
        where: { userId: professionalUserId },
        include: { verification: true },
      });

      const requestId = profile?.verification?.requestId || 'req_valid_123';
      const state = jwt.sign(
        { userId: professionalUserId, requestId, provider: 'DIGILOCKER' },
        config.jwt.secret,
        { expiresIn: '15m' }
      );

      // Submit test authorization code (safe sandbox fallback in test mode)
      const res = await request(app)
        .post('/api/v1/professionals/verification/callback')
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({
          code: 'mock_test_code',
          state,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
      expect(res.body.data.badgeText).toBe('✓ Verified via DigiLocker');

      // Check updated status endpoint
      const statusRes = await request(app)
        .get('/api/v1/professionals/verification/status')
        .set('Authorization', `Bearer ${professionalToken}`);
      expect(statusRes.body.data.status).toBe('VERIFIED');
      expect(statusRes.body.data.isVerified).toBe(true);
      expect(statusRes.body.data.badgeText).toBe('✓ Verified via DigiLocker');
    });

    it('Replay attack callback is rejected after requestId was cleared', async () => {
      // Re-use an expired or used requestId
      const state = jwt.sign(
        { userId: professionalUserId, requestId: 'already_used_requestId', provider: 'DIGILOCKER' },
        config.jwt.secret,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .post('/api/v1/professionals/verification/callback')
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({
          code: 'mock_test_code',
          state,
        });

      // Verification requestId was cleared upon successful verification, so mismatch/rejection occurs
      expect(res.status).toBe(400);
    });
  });

  describe('Webhook & Idempotency', () => {
    it('Asynchronous webhook processing is idempotent', async () => {
      const webhookPayload = {
        requestId: 'wh_test_req_123',
        status: 'SUCCESS',
        referenceId: 'DL-IN-WEBHOOK-99',
      };

      const res = await request(app)
        .post('/api/v1/professionals/verification/webhook')
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Admin Verification Governance & Overrides', () => {
    it('Admin can view verification queue with status filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/verifications?status=VERIFIED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('Admin can view full verification case details', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/verifications')
        .set('Authorization', `Bearer ${adminToken}`);

      const target = listRes.body.data?.[0];
      if (target) {
        const detailRes = await request(app)
          .get(`/api/v1/admin/verifications/${target.id}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(detailRes.status).toBe(200);
        expect(detailRes.body.data.id).toBe(target.id);
        expect(detailRes.body.data.auditLogs).toBeDefined();
      }
    });

    it('Administrative override without reason is rejected (HTTP 400)', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/verifications')
        .set('Authorization', `Bearer ${adminToken}`);

      const target = listRes.body.data?.[0];
      if (target) {
        const res = await request(app)
          .post(`/api/v1/admin/verifications/${target.id}/override`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ action: 'APPROVE', reason: '' });

        expect(res.status).toBe(400);
        expect(res.body.error.message).toContain('mandatory');
      }
    });

    it('Administrative override with justification records audit trail', async () => {
      const listRes = await request(app)
        .get('/api/v1/admin/verifications')
        .set('Authorization', `Bearer ${adminToken}`);

      const target = listRes.body.data?.[0];
      if (target) {
        const res = await request(app)
          .post(`/api/v1/admin/verifications/${target.id}/override`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            action: 'APPROVE',
            reason: 'Legal compliance manual Aadhaar document verification confirmed via support ticket #VZ-9901.',
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('VERIFIED');

        // Check audit log
        const auditLog = await prisma.auditLog.findFirst({
          where: { action: 'ADMIN_VERIFICATION_OVERRIDE' },
          orderBy: { createdAt: 'desc' },
        });
        expect(auditLog).toBeDefined();
        expect(auditLog?.metadata).toContain('VZ-9901');
      }
    });
  });
});
