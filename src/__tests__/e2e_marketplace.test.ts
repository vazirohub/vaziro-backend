import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';
import { AIMatchService } from '../services/ai-match.service';

describe('Vaziro End-to-End Marketplace Flow (Phase 10 E2E Verification)', () => {
  let customerUser: any;
  let customerProfile: any;
  let professionalUser: any;
  let professionalProfile: any;
  let category: any;
  let subcategory: any;
  let city: any;
  let requirement: any;
  let quotation: any;
  let job: any;

  beforeAll(async () => {
    // 1. Fetch seed category, subcategory, and city
    category = await prisma.category.findFirst({ where: { slug: 'physiotherapist' } });
    subcategory = await prisma.subcategory.findFirst({ where: { categoryId: category.id } });
    city = await prisma.city.findFirst({ where: { slug: 'bengaluru' } });

    // 2. Create customer test user
    const custPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    customerUser = await prisma.user.create({
      data: {
        firstName: 'Ananya',
        lastName: 'Sharma',
        phone: custPhone,
        status: 'ACTIVE',
      },
    });

    customerProfile = await prisma.customerProfile.create({
      data: {
        userId: customerUser.id,
        cityId: city.id,
        trustScore: 100,
      },
    });

    // 3. Create professional test user
    const profPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    professionalUser = await prisma.user.create({
      data: {
        firstName: 'Dr. Rajesh',
        lastName: 'Verma',
        phone: profPhone,
        status: 'ACTIVE',
      },
    });

    professionalProfile = await prisma.professionalProfile.create({
      data: {
        userId: professionalUser.id,
        title: 'Senior Sports Physiotherapist',
        yearsOfExperience: 7,
        hourlyRate: 1500,
        rating: 4.9,
        reviewsCount: 12,
        completedJobsCount: 15,
        isVerified: true,
      },
    });

    // Verification record (DigiLocker)
    await prisma.verification.create({
      data: {
        professionalProfileId: professionalProfile.id,
        status: 'VERIFIED',
        provider: 'DIGILOCKER',
        referenceId: `DL-TEST-${Date.now()}`,
        verifiedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (job) {
      await prisma.review.deleteMany({ where: { jobId: job.id } });
      await prisma.jobStatusHistory.deleteMany({ where: { jobId: job.id } });
      await prisma.paymentFee.deleteMany({ where: { payment: { jobId: job.id } } });
      await prisma.paymentProtection.deleteMany({ where: { jobId: job.id } });
      await prisma.paymentTransaction.deleteMany({ where: { payment: { jobId: job.id } } });
      await prisma.paymentAttempt.deleteMany({ where: { payment: { jobId: job.id } } });
      await prisma.payment.deleteMany({ where: { jobId: job.id } });
      await prisma.message.deleteMany({ where: { chatThread: { jobId: job.id } } });
      await prisma.chatParticipant.deleteMany({ where: { chatThread: { jobId: job.id } } });
      await prisma.chatThread.deleteMany({ where: { jobId: job.id } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { jobId: job.id } } });
      await prisma.invoice.deleteMany({ where: { jobId: job.id } });
      await prisma.professionalPayout.deleteMany({ where: { professionalProfileId: professionalProfile.id } });
      await prisma.job.delete({ where: { id: job.id } });
    }

    if (quotation) {
      await prisma.quotation.deleteMany({ where: { id: quotation.id } });
    }

    if (requirement) {
      await prisma.application.deleteMany({ where: { requirementId: requirement.id } });
      await prisma.requirement.delete({ where: { id: requirement.id } });
    }

    if (professionalProfile) {
      await prisma.creditLedger.deleteMany({ where: { professionalProfileId: professionalProfile.id } });
      await prisma.planPurchase.deleteMany({ where: { professionalProfileId: professionalProfile.id } });
      await prisma.creditBatch.deleteMany({ where: { professionalProfileId: professionalProfile.id } });
      await prisma.creditTransaction.deleteMany({ where: { wallet: { professionalProfileId: professionalProfile.id } } });
      await prisma.creditWallet.deleteMany({ where: { professionalProfileId: professionalProfile.id } });
      await prisma.verification.deleteMany({ where: { professionalProfileId: professionalProfile.id } });
      await prisma.professionalProfile.delete({ where: { id: professionalProfile.id } });
    }

    if (customerProfile) {
      await prisma.customerProfile.delete({ where: { id: customerProfile.id } });
    }

    if (customerUser) await prisma.user.delete({ where: { id: customerUser.id } });
    if (professionalUser) await prisma.user.delete({ where: { id: professionalUser.id } });
  });

  it('Step 1: Customer posts requirement with budget ₹5,000', async () => {
    requirement = await prisma.requirement.create({
      data: {
        customerId: customerProfile.id,
        categoryId: category.id,
        subcategoryId: subcategory.id,
        title: 'Home Physiotherapist needed for elderly rehabilitation',
        description: 'Daily physiotherapy sessions for mobility improvement.',
        budgetType: 'FIXED',
        budgetMin: 5000,
        budgetMax: 5000,
        currency: 'INR',
        cityId: city.id,
        status: 'RECEIVING_QUOTES',
      },
    });

    expect(requirement.id).toBeDefined();
    expect(requirement.budgetMin).toBe(5000);
    expect(requirement.status).toBe('RECEIVING_QUOTES');
  });

  it('Step 2: Professional inspects wallet and purchases Growth Plan (115 credits)', async () => {
    const wallet = await CreditService.getOrCreateWallet(professionalProfile.id);
    expect(wallet.balance).toBeGreaterThanOrEqual(10);

    // Purchase Growth Plan (115 credits) to have balance for ₹5,000 requirement (50 credits)
    const purchaseResult = await CreditService.fulfillPlanPurchase(
      professionalProfile.id,
      'growth',
      { razorpayPaymentId: `pay_test_${Date.now()}`, amountPaid: 1000 }
    );
    expect(purchaseResult.wallet?.balance).toBeGreaterThanOrEqual(125);
  });

  it('Step 3: Professional applies & submits quotation (Deducts 50 Credits atomically)', async () => {
    const creditCost = await CreditService.calculateFee(requirement.budgetMin, requirement.budgetMax);
    expect(creditCost).toBe(50);

    const deduction = await CreditService.deductCreditsForApplication(
      professionalProfile.id,
      requirement.id,
      creditCost
    );
    expect(deduction.creditsDeducted).toBe(50);

    // Create Application & Quotation
    const application = await prisma.application.create({
      data: {
        requirementId: requirement.id,
        professionalProfileId: professionalProfile.id,
        creditsSpent: creditCost,
        status: 'SUBMITTED',
      },
    });

    quotation = await prisma.quotation.create({
      data: {
        applicationId: application.id,
        requirementId: requirement.id,
        professionalProfileId: professionalProfile.id,
        proposedPrice: 5000,
        currency: 'INR',
        estimatedTimeline: '5 days',
        message: 'I specialize in geriatric rehabilitation and can start immediately.',
        status: 'SUBMITTED',
      },
    });

    expect(quotation.id).toBeDefined();
    expect(quotation.proposedPrice).toBe(5000);
  });

  it('Step 4: Customer checks AI Match Score for received quotation', () => {
    const match = AIMatchService.calculateMatchScore(requirement, {
      ...professionalProfile,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      cityId: city.id,
    });

    expect(match.score).toBeGreaterThanOrEqual(85);
    expect(match.reasons.length).toBeGreaterThan(0);
  });

  it('Step 5: Customer hires professional with Payment Protection', async () => {
    // Atomic hire
    job = await prisma.$transaction(async (tx) => {
      await tx.requirement.update({
        where: { id: requirement.id },
        data: { status: 'HIRED' },
      });

      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: 'ACCEPTED' },
      });

      const newJob = await tx.job.create({
        data: {
          requirementId: requirement.id,
          customerId: customerProfile.id,
          professionalProfileId: professionalProfile.id,
          quotationId: quotation.id,
          agreedPrice: quotation.proposedPrice,
          currency: 'INR',
          status: 'HIRED',
          paymentProtectionEnabled: true,
        },
      });

      await tx.jobStatusHistory.create({
        data: {
          jobId: newJob.id,
          previousStatus: 'NEW',
          newStatus: 'HIRED',
          changedByUserId: customerUser.id,
          reason: 'Customer accepted quotation with Payment Protection',
        },
      });

      return newJob;
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe('HIRED');
    expect(job.paymentProtectionEnabled).toBe(true);
  });

  it('Step 6: Service progresses through discrete milestones to completion', async () => {
    const stages = ['SCHEDULED', 'PREPARING', 'ON_THE_WAY', 'ARRIVED', 'SERVICE_STARTED', 'SERVICE_COMPLETED'];

    for (const stage of stages) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: stage },
      });

      await prisma.jobStatusHistory.create({
        data: {
          jobId: job.id,
          newStatus: stage,
          changedByUserId: professionalUser.id,
          reason: `Milestone advanced to ${stage}`,
        },
      });
    }

    const updated = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updated?.status).toBe('SERVICE_COMPLETED');
  });

  it('Step 7: Customer approves delivery & releases payment (6% fee, 18% GST invoice, payout)', async () => {
    const totalAmount = job.agreedPrice; // 5000
    const platformFee = Math.round((totalAmount * 6) / 100); // 300
    const cgst = Math.round((platformFee * 9) / 100); // 27
    const sgst = Math.round((platformFee * 9) / 100); // 27
    const netPayout = totalAmount - platformFee; // 4700

    expect(platformFee).toBe(300);
    expect(netPayout).toBe(4700);

    const result = await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: { status: 'PAYMENT_RELEASED' },
      });

      const payout = await tx.professionalPayout.create({
        data: {
          professionalProfileId: professionalProfile.id,
          amount: netPayout,
          currency: 'INR',
          status: 'PENDING',
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          jobId: job.id,
          invoiceNumber: `VAZ-TEST-${Date.now()}`,
          taxableAmount: platformFee,
          cgstAmount: cgst,
          sgstAmount: sgst,
          igstAmount: 0,
          totalAmount,
          status: 'ISSUED',
          items: {
            create: [
              {
                description: 'Vaziro Platform Fee (6%)',
                unitPrice: platformFee,
                quantity: 1,
                amount: platformFee,
                taxRate: 18.0,
              },
            ],
          },
        },
      });

      return { payout, invoice };
    });

    expect(result.payout.amount).toBe(4700);
    expect(result.invoice.taxableAmount).toBe(300);
  });

  it('Step 8: Customer submits verified review (5 stars)', async () => {
    const review = await prisma.review.create({
      data: {
        jobId: job.id,
        customerId: customerProfile.id,
        professionalProfileId: professionalProfile.id,
        rating: 5,
        comment: 'Exceptional physiotherapy care. Punctual, professional, and courteous.',
        moderationStatus: 'APPROVED',
      },
    });

    expect(review.rating).toBe(5);
    expect(review.jobId).toBe(job.id);
  });
});
