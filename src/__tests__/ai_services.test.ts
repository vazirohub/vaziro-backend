import request from 'supertest';
import app from '../app';
import { GeminiService } from '../services/gemini.service';
import { AIMatchService } from '../services/ai-match.service';

describe('Google Gemini AI Integration Tests', () => {
  jest.setTimeout(15000);
  const dummyRequirement = {
    title: 'Elderly Caregiver for 80-year-old mother',
    categoryId: 'cat-1',
    category: { name: 'Elderly Caregiver' },
    subcategoryId: 'sub-1',
    subcategory: { name: 'Dementia Care' },
    cityId: 'city-1',
    city: { name: 'Bengaluru' },
    pincode: '560038',
    minimumBudget: 15000,
    maximumBudget: 25000,
    description: 'Looking for a gentle and experienced caregiver who can help with daily mobility and meals in Indiranagar.',
  };

  const dummyProfessional = {
    id: 'pro-1',
    firstName: 'Priya',
    lastName: 'Sharma',
    isVerified: true,
    rating: 4.8,
    completedJobsCount: 18,
    hourlyRate: 20000,
    subcategoryId: 'sub-1',
    cityId: 'city-1',
    pincodes: ['560038', '560008'],
  };

  it('1. should verify GeminiService is configured', () => {
    expect(GeminiService.isAvailable()).toBe(true);
  });

  it('2. AIMatchService should calculate high score with deterministic fallback', () => {
    const match = AIMatchService.calculateMatchScore(dummyRequirement, dummyProfessional);
    expect(match.score).toBeGreaterThanOrEqual(80);
    expect(match.ratingGrade).toBeDefined();
    expect(match.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('3. AIMatchService.calculateMatchScoreWithGemini should return score, rating, and rationale', async () => {
    const match = await AIMatchService.calculateMatchScoreWithGemini(dummyRequirement, dummyProfessional);
    expect(match.score).toBeGreaterThanOrEqual(60);
    expect(match.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(match.reasons)).toBe(true);
    expect(match.reasons.length).toBeGreaterThan(0);
  });

  it('4. POST /api/v1/ai/polish-requirement should validate empty input', async () => {
    const res = await request(app)
      .post('/api/v1/ai/polish-requirement')
      .send({ rawDescription: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('5. POST /api/v1/ai/polish-requirement should return structured requirement details', async () => {
    const res = await request(app)
      .post('/api/v1/ai/polish-requirement')
      .send({
        categoryName: 'Physiotherapist',
        rawDescription: 'need physio for post knee surgery at home in noida',
        city: 'Noida',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBeDefined();
    expect(res.body.data.description).toBeDefined();
    expect(res.body.data.description.length).toBeGreaterThan(20);
  });

  it('6. POST /api/v1/ai/support-chat should answer queries about escrow and payment protection', async () => {
    const res = await request(app)
      .post('/api/v1/ai/support-chat')
      .send({
        message: 'How does payment protection work on Vaziro?',
        role: 'CUSTOMER',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reply).toBeDefined();
    expect(typeof res.body.data.reply).toBe('string');
  });
});
