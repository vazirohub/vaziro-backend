import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { config } from '../config';

import { ensureDatabaseSchema } from '../lib/auto-migrate';

describe('Professional Profile System, Profile Strength & Trust Score', () => {
  let customerToken: string;
  let customerUserId: string;
  let professionalToken: string;
  let professionalUserId: string;
  let professionalProfileId: string;
  let professionalSlug: string;

  beforeAll(async () => {
    // 0. Ensure SQLite schema is completely up-to-date
    await ensureDatabaseSchema();

    // 1. Roles
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

    // 2. Customer User
    const custUser = await prisma.user.create({
      data: {
        phone: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Sneha',
        lastName: 'Patel',
        status: 'ACTIVE',
        roles: { create: { roleId: custRole.id } },
        customerProfile: { create: {} },
      },
    });
    customerUserId = custUser.id;
    customerToken = jwt.sign({ userId: custUser.id }, config.jwt.secret, { expiresIn: '1h' });

    // 3. Professional User
    const profUser = await prisma.user.create({
      data: {
        phone: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Rahul',
        lastName: 'Verma',
        email: `rahul.${Date.now()}@vaziro.in`,
        status: 'ACTIVE',
        roles: { create: { roleId: profRole.id } },
        professionalProfile: {
          create: {
            title: 'Certified Physiotherapist',
            bio: 'Dedicated physiotherapist with expertise in geriatric mobility and rehabilitation therapy.',
            yearsOfExperience: 4,
            hourlyRate: 800,
            languages: 'Hindi, English, Punjabi',
            availabilityStatus: 'AVAILABLE',
            workingDays: 'Monday,Tuesday,Wednesday,Thursday,Friday',
            workingHours: '09:00 AM - 05:00 PM',
            visibility: 'PUBLIC',
          },
        },
      },
      include: { professionalProfile: true },
    });
    professionalUserId = profUser.id;
    professionalProfileId = profUser.professionalProfile!.id;
    professionalToken = jwt.sign({ userId: profUser.id }, config.jwt.secret, { expiresIn: '1h' });
  });

  describe('Profile Fetch & Calculations', () => {
    it('Professional can retrieve their own profile with Profile Strength and Trust Score', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(professionalProfileId);
      expect(res.body.data.slug).toBeDefined();
      professionalSlug = res.body.data.slug;

      // Check Profile Strength structure
      expect(res.body.data.profileStrength).toBeDefined();
      expect(typeof res.body.data.profileStrength.score).toBe('number');
      expect(res.body.data.profileStrength.score).toBeGreaterThan(0);
      expect(res.body.data.profileStrength.recommendations).toBeInstanceOf(Array);

      // Check Trust Score structure
      expect(res.body.data.trustScore).toBeDefined();
      expect(typeof res.body.data.trustScore.score).toBe('number');
      expect(res.body.data.trustScore.trustBadgeText).toBeDefined();
      expect(res.body.data.trustScore.signals).toBeInstanceOf(Array);
    });

    it('Customer cannot access professional profile management (HTTP 403)', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Unauthenticated user cannot access professional profile (HTTP 401)', async () => {
      const res = await request(app).get('/api/v1/professionals/me');
      expect(res.status).toBe(401);
    });
  });

  describe('Profile Strength API & Recommendations', () => {
    it('GET /api/v1/professionals/profile/strength returns detailed breakdown and recommendations', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/profile/strength')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.level).toBeDefined();
      expect(res.body.data.completedCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalCount).toBe(12);
      expect(res.body.data.recommendations).toBeInstanceOf(Array);

      // Recommendations should provide actionable items with actionKey and actionLabel
      if (res.body.data.recommendations.length > 0) {
        const rec = res.body.data.recommendations[0];
        expect(rec.actionKey).toBeDefined();
        expect(rec.actionLabel).toBeDefined();
      }
    });
  });

  describe('Trust Score API & Objective Signals', () => {
    it('GET /api/v1/professionals/profile/trust-score returns signals breakdown and fair new professional status', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/profile/trust-score')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.score).toBe('number');
      expect(res.body.data.signals.length).toBe(9);
      expect(res.body.data.tooltipText).toContain('Vaziro Trust Score');

      // Professional has no jobs yet, so isNewProfessional should be handled fairly
      expect(res.body.data.isNewProfessional).toBe(true);
      expect(res.body.data.trustBadgeText).toBe('New Professional');
    });
  });

  describe('Profile Update & Skills Synchronization', () => {
    it('PUT /api/v1/professionals/me updates bio, skills, and availability', async () => {
      const res = await request(app)
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({
          title: 'Senior Clinical Physiotherapist',
          bio: 'Specialized in elderly rehabilitation, stroke recovery, and posture correction therapies with over 4 years of clinical practice.',
          yearsOfExperience: 5,
          hourlyRate: 950,
          availabilityStatus: 'AVAILABLE',
          workingDays: 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday',
          workingHours: '08:00 AM - 06:00 PM',
          workingPreferences: 'On-demand, Flexible',
          qualifications: 'Bachelor of Physiotherapy (BPT) - Certified Rehab Specialist',
          serviceDescription: 'Comprehensive home physiotherapy, manual therapy, and joint mobilization.',
          experienceDescription: 'Served over 100+ private home patients across Noida and Delhi.',
          skills: ['Geriatric Care', 'Rehabilitation Therapy', 'Stroke Recovery'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Senior Clinical Physiotherapist');
      expect(res.body.data.yearsOfExperience).toBe(5);
      expect(res.body.data.skills.length).toBe(3);
      expect(res.body.data.profileStrength.score).toBeGreaterThan(50);
    });

    it('Customer cannot update professional profile (HTTP 403)', async () => {
      const res = await request(app)
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(403);
    });
  });

  describe('Public Profile & Privacy Security', () => {
    it('Customer and public can view professional profile via slug without leaking sensitive data', async () => {
      const res = await request(app).get(`/api/v1/professionals/${professionalSlug}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe(professionalSlug);
      expect(res.body.data.name).toBe('Rahul Verma');
      expect(res.body.data.title).toBe('Senior Clinical Physiotherapist');
      expect(res.body.data.trustSummary).toBeDefined();
      expect(res.body.data.skills).toContain('Geriatric Care');

      // CRITICAL SECURITY CHECKS: Zero private data leakage
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.email).toBeUndefined();
      expect(res.body.data.phone).toBeUndefined();
      expect(res.body.data.bankAccountDetails).toBeUndefined();
      expect(res.body.data.payouts).toBeUndefined();
      expect(res.body.data.linkedAccount).toBeUndefined();
      expect(res.body.data.creditWallet).toBeUndefined();
    });

    it('Customer can view professional profile via UUID as fallback', async () => {
      const res = await request(app).get(`/api/v1/professionals/${professionalProfileId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(professionalProfileId);
    });

    it('Profile preview returns identical sanitized public data for professional', async () => {
      const res = await request(app)
        .get('/api/v1/professionals/profile/preview')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe(professionalSlug);
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.email).toBeUndefined();
    });

    it('When professional sets visibility to HIDDEN, public endpoint returns HTTP 404', async () => {
      // Set to hidden
      await request(app)
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({ visibility: 'HIDDEN' });

      const res = await request(app).get(`/api/v1/professionals/${professionalSlug}`);
      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('private');

      // Restore to public
      await request(app)
        .put('/api/v1/professionals/me')
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({ visibility: 'PUBLIC' });
    });
  });
});
