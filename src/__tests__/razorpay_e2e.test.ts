import request from 'supertest';
import crypto from 'crypto';
import app from '../app';
import { RazorpayService } from '../services/razorpay.service';
import { prisma } from '../lib/prisma';
import { config } from '../config';

describe('Razorpay Payment Gateway Master Integration Tests', () => {
  const testKeySecret = config.razorpay.keySecret;
  const testWebhookSecret = config.razorpay.webhookSecret;

  beforeAll(async () => {
    // Clean up test records if any
    await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: 'test_evt_' } } });
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: 'test_evt_' } } });
  });

  it('1. Config Endpoint: Should return public keyId and INR currency', async () => {
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.keyId).toBe(config.razorpay.keyId);
    expect(res.body.data.currency).toBe('INR');
  });

  it('2. Amount Rule: Should calculate amounts strictly in paise (1 INR = 100 paise)', async () => {
    const amountInr = 2499;
    const order = await RazorpayService.createOrder(amountInr, 'test_receipt_123');
    expect(order.amount).toBe(249900); // 2499 * 100 paise
    expect(order.currency).toBe('INR');
  });

  it('3. Signature Verification: Valid HMAC-SHA256 signature must succeed', () => {
    const orderId = 'order_test_1001';
    const paymentId = 'pay_test_9001';
    const validSignature = crypto
      .createHmac('sha256', testKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = RazorpayService.verifyPaymentSignature(orderId, paymentId, validSignature);
    expect(isValid).toBe(true);
  });

  it('4. Signature Security: Tampered or forged signature must be strictly rejected', () => {
    const orderId = 'order_test_1001';
    const paymentId = 'pay_test_9001';
    const forgedSignature = 'forged_fake_signature_abc123';

    const isValid = RazorpayService.verifyPaymentSignature(orderId, paymentId, forgedSignature);
    expect(isValid).toBe(false);
  });

  it('5. Webhook Signature: Raw body HMAC-SHA256 validation must verify authenticity', () => {
    const rawPayload = JSON.stringify({ event: 'payment.captured', test: true });
    const validSignature = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(rawPayload)
      .digest('hex');

    const isValid = RazorpayService.verifyWebhookSignature(rawPayload, validSignature, testWebhookSecret);
    expect(isValid).toBe(true);

    const isTamperedValid = RazorpayService.verifyWebhookSignature(rawPayload, 'invalid_sig', testWebhookSecret);
    expect(isTamperedValid).toBe(false);
  });

  it('6. Webhook Processing & Idempotency: Duplicate events must return 200 without duplicate execution', async () => {
    const eventId = `test_evt_${Date.now()}`;
    const payload = {
      event: 'payment.captured',
      event_id: eventId,
      payload: {
        payment: {
          entity: {
            id: `pay_test_${Date.now()}`,
            order_id: `order_test_${Date.now()}`,
            amount: 500000,
            status: 'captured',
            method: 'upi',
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(rawBody)
      .digest('hex');

    // First Webhook Delivery
    const firstRes = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .set('content-type', 'application/json')
      .send(rawBody);

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.success).toBe(true);

    // Verify WebhookEvent stored in database
    const recordedEvent = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });
    expect(recordedEvent).not.toBeNull();
    expect(recordedEvent?.processed).toBe(true);

    // Duplicate Webhook Delivery (Idempotent Retry)
    const duplicateRes = await request(app)
      .post('/api/v1/payments/razorpay/webhook')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .set('content-type', 'application/json')
      .send(rawBody);

    expect(duplicateRes.status).toBe(200);
    expect(duplicateRes.body.success).toBe(true);
    expect(duplicateRes.body.message).toContain('idempotent duplicate ignore');
  });

  it('7. Webhook URL Compatibility: Both /api/v1/payments/webhook and /api/payments/razorpay/webhook work', async () => {
    const eventId = `test_evt_alias_${Date.now()}`;
    const payload = {
      event: 'payment.captured',
      event_id: eventId,
      payload: { payment: { entity: { id: `pay_alias_${Date.now()}`, order_id: `order_alias_${Date.now()}`, amount: 100000 } } },
    };
    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', testWebhookSecret)
      .update(rawBody)
      .digest('hex');

    const res = await request(app)
      .post('/api/payments/razorpay/webhook')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', eventId)
      .set('content-type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
