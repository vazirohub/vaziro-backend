import request from 'supertest';
import app from '../app';

describe('Auth API & Indian Phone OTP', () => {
  const testPhone = '+9199' + Date.now().toString().slice(-8);

  it('POST /api/v1/auth/otp/request should validate Indian phone format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: '123456' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/auth/otp/request should dispatch OTP for valid phone', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: testPhone });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phone).toBe(testPhone);
  });

  it('POST /api/v1/auth/login with valid demo credentials should succeed', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@vaziro.in',
        password: 'VaziroPass2026!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe('admin@vaziro.in');
    expect(res.body.data.user.roles).toContain('ADMIN');
  });

  it('POST /api/v1/auth/otp/verify should authenticate when msg91Verified is true', async () => {
    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({
        phone: '9999977777',
        msg91Verified: true,
        role: 'CUSTOMER',
        firstName: 'TestCustomer',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.phone).toBe('+919999977777');
    expect(res.body.data.user.firstName).toBe('TestCustomer');
  });

  it('GET /api/v1/auth/user-exists should return strictly { user_found, identifier }', async () => {
    const res = await request(app)
      .get('/api/v1/auth/user-exists?identifier=9999977777');

    expect(res.status).toBe(200);
    expect(res.body.user_found).toBe(true);
    expect(res.body.identifier).toBe('9999977777');
  });

  describe('MSG91 OTP Authentication Flow (Sections 6-16 & 28-29)', () => {
    const uniqueSuffix = Date.now().toString().slice(-8);
    const unregMobile = `91${uniqueSuffix}`;
    let signupToken = '';

    it('POST /api/auth/check-mobile should return exists: false for unreg mobile', async () => {
      const res = await request(app)
        .post('/api/auth/check-mobile')
        .send({ mobile: unregMobile });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exists).toBe(false);
      expect(res.body.mobile).toBe(`+91${unregMobile}`);
    });

    it('POST /api/auth/check-mobile should return exists: true for existing user', async () => {
      const res = await request(app)
        .post('/api/auth/check-mobile')
        .send({ mobile: '9999977777' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exists).toBe(true);
    });

    it('POST /api/auth/send-otp should dispatch OTP and return cooldownSeconds', async () => {
      const res = await request(app)
        .post('/api/auth/send-otp')
        .send({ mobile: unregMobile });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cooldownSeconds).toBeGreaterThan(0);
    });

    it('POST /api/auth/resend-otp should enforce cooldown when requested immediately', async () => {
      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({ mobile: unregMobile });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.data.cooldownSeconds).toBeGreaterThan(0);
    });

    it('POST /api/auth/verify-otp should return signupToken for new unregistered user', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({
          mobile: unregMobile,
          otp: '123456', // development test-bypass code
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isNewUser).toBe(true);
      expect(res.body.data.signupToken).toBeDefined();
      signupToken = res.body.data.signupToken;
    });

    it('POST /api/auth/complete-signup should STRICTLY REJECT ADMIN role', async () => {
      const res = await request(app)
        .post('/api/auth/complete-signup')
        .send({
          signupToken,
          role: 'ADMIN',
          name: 'Malicious Admin',
        });

      expect(res.status).toBe(422); // Zod enum check
      expect(res.body.success).toBe(false);
    });

    it('POST /api/auth/complete-signup should successfully register new CUSTOMER', async () => {
      const res = await request(app)
        .post('/api/auth/complete-signup')
        .send({
          signupToken,
          role: 'CUSTOMER',
          name: 'Rajesh Sharma',
          email: `rajesh_${uniqueSuffix}@example.com`,
          city: 'Mumbai',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.firstName).toBe('Rajesh');
      expect(res.body.data.user.roles).toContain('CUSTOMER');
    });

    it('POST /api/auth/check-mobile should now return exists: true for newly created user', async () => {
      const res = await request(app)
        .post('/api/auth/check-mobile')
        .send({ mobile: unregMobile });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exists).toBe(true);
    });

    it('POST /api/auth/complete-signup should register a PROFESSIONAL with initial credits', async () => {
      const proSuffix = (Number(uniqueSuffix) + 1).toString();
      const proMobile = `92${proSuffix}`;
      // Request and verify OTP first
      await request(app).post('/api/auth/send-otp').send({ mobile: proMobile });
      const verifyRes = await request(app)
        .post('/api/auth/verify-otp')
        .send({ mobile: proMobile, otp: '123456' });

      expect(verifyRes.body.data.isNewUser).toBe(true);
      const proSignupToken = verifyRes.body.data.signupToken;

      const res = await request(app)
        .post('/api/auth/complete-signup')
        .send({
          signupToken: proSignupToken,
          role: 'PROFESSIONAL',
          name: 'Anil Electrician',
          email: `anil_${proSuffix}@example.com`,
          city: 'Bengaluru',
          businessName: 'Anil Electrical Solutions',
          category: 'Electrician',
          experience: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.firstName).toBe('Anil');
      expect(res.body.data.user.roles).toContain('PROFESSIONAL');
      expect(res.body.data.user.professionalProfile.creditWallet.balance).toBe(10);
    });
  });
});

