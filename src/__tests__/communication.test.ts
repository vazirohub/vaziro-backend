import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { ensureDatabaseSchema } from '../lib/auto-migrate';
import { NotificationService } from '../services/notification.service';

describe('Vaziro Communication System (Chat + Request Call + Moderation)', () => {
  let customerToken: string;
  let customerUserId: string;
  let professionalToken: string;
  let professionalUserId: string;
  let otherCustomerToken: string;
  let otherCustomerUserId: string;
  let adminToken: string;
  let adminUserId: string;

  let testJobId: string;
  let testConversationId: string;

  beforeAll(async () => {
    jest.spyOn(NotificationService, 'sendEmailViaResend').mockResolvedValue({ success: true, id: 'test-email-id' });
    await ensureDatabaseSchema();

    // Setup roles
    const custRole = await prisma.role.upsert({
      where: { name: 'CUSTOMER' },
      update: {},
      create: { name: 'CUSTOMER', description: 'Customer' },
    });
    const profRole = await prisma.role.upsert({
      where: { name: 'PROFESSIONAL' },
      update: {},
      create: { name: 'PROFESSIONAL', description: 'Professional' },
    });
    const adminRole = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', description: 'Admin' },
    });

    // 1. Customer User
    const custUser = await prisma.user.create({
      data: {
        phone: `+9191${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Ananya',
        lastName: 'Sharma',
        status: 'ACTIVE',
        roles: { create: { roleId: custRole.id } },
        customerProfile: { create: {} },
      },
    });
    customerUserId = custUser.id;
    customerToken = jwt.sign({ userId: custUser.id }, config.jwt.secret, { expiresIn: '1h' });

    // 2. Professional User
    const profUser = await prisma.user.create({
      data: {
        phone: `+9192${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Vikram',
        lastName: 'Singh',
        email: `vikram.${Date.now()}@vaziro.in`,
        status: 'ACTIVE',
        roles: { create: { roleId: profRole.id } },
        professionalProfile: {
          create: {
            title: 'Senior Home Nurse',
            bio: 'Expert geriatric and critical patient home care support.',
            isVerified: true,
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
    });
    professionalUserId = profUser.id;
    professionalToken = jwt.sign({ userId: profUser.id }, config.jwt.secret, { expiresIn: '1h' });

    // 3. Other Unrelated Customer
    const otherCustUser = await prisma.user.create({
      data: {
        phone: `+9193${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Pooja',
        lastName: 'Nair',
        status: 'ACTIVE',
        roles: { create: { roleId: custRole.id } },
        customerProfile: { create: {} },
      },
    });
    otherCustomerUserId = otherCustUser.id;
    otherCustomerToken = jwt.sign({ userId: otherCustUser.id }, config.jwt.secret, { expiresIn: '1h' });

    // 4. Admin User
    const adminUser = await prisma.user.create({
      data: {
        phone: `+9194${Math.floor(10000000 + Math.random() * 90000000)}`,
        firstName: 'Vaziro',
        lastName: 'Moderator',
        status: 'ACTIVE',
        roles: { create: { roleId: adminRole.id } },
      },
    });
    adminUserId = adminUser.id;
    adminToken = jwt.sign({ userId: adminUser.id }, config.jwt.secret, { expiresIn: '1h' });

    // 5. Category & Subcategory
    const cat = await prisma.category.findFirst() || await prisma.category.create({
      data: { name: 'Home Nursing', slug: `home-nursing-${Date.now()}` },
    });
    const subcat = await prisma.subcategory.findFirst({ where: { categoryId: cat.id } }) ||
      await prisma.subcategory.create({
        data: { name: 'Elderly Care', slug: `elderly-care-${Date.now()}`, categoryId: cat.id },
      });

    // 6. Requirement & Job
    const custProfile = await prisma.customerProfile.findFirst({ where: { userId: customerUserId } });
    const profProfile = await prisma.professionalProfile.findFirst({ where: { userId: professionalUserId } });

    const req = await prisma.requirement.create({
      data: {
        customerId: custProfile!.id,
        categoryId: cat.id,
        subcategoryId: subcat.id,
        title: 'Need 12-hour Elderly Caregiver',
        description: 'Need compassionate home attendant for daily medical and mobility support.',
        budgetMin: 12000,
        budgetMax: 15000,
        status: 'OPEN',
      },
    });

    const quotation = await prisma.quotation.create({
      data: {
        requirementId: req.id,
        professionalProfileId: profProfile!.id,
        proposedPrice: 14000,
        estimatedTimeline: '1 Month',
        message: 'I can start from next week. Available 12 hours daily.',
        status: 'SUBMITTED',
      },
    });

    const job = await prisma.job.create({
      data: {
        requirementId: req.id,
        quotationId: quotation.id,
        customerId: custProfile!.id,
        professionalProfileId: profProfile!.id,
        agreedPrice: 14000,
        status: 'HIRED',
      },
    });
    testJobId = job.id;
  });

  describe('1. Conversation Creation & Authorization', () => {
    it('Customer starts a job-linked conversation with Professional', async () => {
      const res = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          jobId: testJobId,
          otherUserId: professionalUserId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      testConversationId = res.body.data.id;
    });

    it('Professional can view the conversation in their inbox', async () => {
      const res = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = res.body.data.find((c: any) => c.id === testConversationId);
      expect(found).toBeDefined();
      expect(found.otherParticipant.name).toContain('Ananya');
    });

    it('Unrelated customer cannot access this conversation (HTTP 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(403);
    });

    it('Unauthenticated request is rejected (HTTP 401 Unauthorized)', async () => {
      const res = await request(app).get(`/api/v1/conversations/${testConversationId}`);
      expect(res.status).toBe(401);
    });
  });

  describe('2. Text Messaging & Contact Protection', () => {
    it('Customer sends normal inquiry message', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          content: 'Hello Vikram, can you please confirm if you have experience with Parkinson care?',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toContain('Parkinson care');
      expect(res.body.data.status).toBe('SENT');
      expect(res.body.data.isContactWarning).toBe(false);
    });

    it('Professional receives message, reads it, and unread count clears', async () => {
      const res = await request(app)
        .get(`/api/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Verify unread count becomes 0 for professional
      const convs = await request(app)
        .get('/api/v1/conversations')
        .set('Authorization', `Bearer ${professionalToken}`);

      const found = convs.body.data.find((c: any) => c.id === testConversationId);
      expect(found.unreadCount).toBe(0);
    });

    it('Contact information protection: Masks phone number before hire', async () => {
      // Create an unhired requirement conversation
      const otherConv = await request(app)
        .post('/api/v1/conversations')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          otherUserId: otherCustomerUserId,
        });

      const convId = otherConv.body.data.id;

      const res = await request(app)
        .post(`/api/v1/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          content: 'Please call me directly on 9876543210 or email me at user@gmail.com',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isContactWarning).toBe(true);
      expect(res.body.data.content).toContain('[Phone Number Protected by Vaziro - Available After Hiring]');
      expect(res.body.data.content).toContain('[Email Protected by Vaziro - Available After Hiring]');
      expect(res.body.data.warningMessage).toBeDefined();
    });
  });

  describe('3. Attachments & Security Validation', () => {
    it('Valid PNG image attachment upload succeeds', async () => {
      const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/attachments`)
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({
          fileName: 'patient_prescription.png',
          base64Data: dummyBase64,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileUrl).toContain('/public/uploads/chat-attachments/');
      expect(res.body.data.fileType).toBe('PNG');
    });

    it('Malicious executable attachment (.exe, .sh) is strictly rejected', async () => {
      const dummyExeBase64 = 'data:application/octet-stream;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA=';

      const res = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/attachments`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          fileName: 'trojan_payload.exe',
          base64Data: dummyExeBase64,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('prohibited');
    });
  });

  describe('4. Call Request System & Calling Bridge', () => {
    let callRequestId: string;

    it('Customer creates a Call Request with scheduled date & time', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const res = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/call-requests`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          requestedDate: tomorrow.toISOString(),
          requestedStartTime: '04:00 PM',
          requestedEndTime: '04:30 PM',
          message: 'Would like to speak briefly about medication schedule.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.requestedStartTime).toBe('04:00 PM');
      callRequestId = res.body.data.id;
    });

    it('Duplicate pending call request in same conversation is rejected', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const res = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/call-requests`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          requestedDate: tomorrow.toISOString(),
          requestedStartTime: '05:00 PM',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('already have a pending call request');
    });

    it('Requester cannot accept their own call request (HTTP 400/403)', async () => {
      const res = await request(app)
        .post(`/api/v1/call-requests/${callRequestId}/accept`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Only the requested party can accept');
    });

    it('Professional accepts call request -> Transitions to ACCEPTED & initializes ready Call Session', async () => {
      const res = await request(app)
        .post(`/api/v1/call-requests/${callRequestId}/accept`)
        .set('Authorization', `Bearer ${professionalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.callRequest.status).toBe('ACCEPTED');
      expect(res.body.data.session).toBeDefined();
      expect(res.body.data.session.status).toBe('READY');
      expect(res.body.data.session.provider).toBe('VAZIRO_V1_BRIDGE');
      expect(res.body.data.session.displayInstructions).toContain('secure bridge');
    });
  });

  describe('5. Block, Unblock, and Report Moderation', () => {
    it('Customer reports professional message for inappropriate content', async () => {
      const res = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/report`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          reportedUserId: professionalUserId,
          reason: 'SPAM',
          description: 'Repeated promotional links',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OPEN');
    });

    it('Admin can view reported conversations in moderation queue', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reports.length).toBeGreaterThanOrEqual(1);
    });

    it('Admin can resolve report with moderation notes', async () => {
      const list = await request(app)
        .get('/api/v1/admin/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      const reportId = list.body.data.reports[0].id;

      const res = await request(app)
        .post(`/api/v1/admin/reports/${reportId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'RESOLVED',
          adminNotes: 'Reviewed conversation. User reminded of community standards.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
    });

    it('Blocking user prevents sending new messages and call requests', async () => {
      // Customer blocks professional
      const blockRes = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/block`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          blockedUserId: professionalUserId,
          reason: 'No longer needed',
        });

      expect(blockRes.status).toBe(200);

      // Blocked professional tries to message -> rejected
      const msgRes = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${professionalToken}`)
        .send({
          content: 'Can we still connect?',
        });

      expect(msgRes.status).toBe(400);
      expect(msgRes.body.error.message).toContain('blocked');

      // Unblock user
      const unblockRes = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/unblock`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          blockedUserId: professionalUserId,
        });

      expect(unblockRes.status).toBe(200);
    });
  });
});
