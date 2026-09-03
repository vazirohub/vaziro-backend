import request from 'supertest';
import app from '../app';

describe('Health API', () => {
  it('GET /api/v1/health should return 200 and operational status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.data.currency).toBe('INR (₹)');
    expect(res.body.data.timezone).toBe('Asia/Kolkata');
  });

  it('GET /api/v1/categories should return 8 master categories', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(8);
  });

  it('GET /api/v1/locations/states should return active Indian states', async () => {
    const res = await request(app).get('/api/v1/locations/states');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((s: any) => s.code === 'KA')).toBe(true);
  });
});
