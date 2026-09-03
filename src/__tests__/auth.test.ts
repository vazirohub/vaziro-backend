import request from 'supertest';
import app from '../app';

describe('Auth API & Indian Phone OTP', () => {
  const testPhone = '+919999988888';

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
});
