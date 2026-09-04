import { prisma } from '../lib/prisma';
import { CreditService } from '../services/credit.service';

describe('Vaziro Master Specification: Workflow, Credit Refunds & Escrow Security', () => {
  let customerUser: any;
  let customerProfile: any;
  let profAUser: any;
  let profAProfile: any;
  let profBUser: any;
  let profBProfile: any;
  let category: any;
  let subcategory: any;
  let city: any;
  let requirement: any;
  let appA: any;
  let appB: any;
  let quoteA: any;
  let quoteB: any;

  beforeAll(async () => {
    // 1. Get seed data
    category = await prisma.category.findFirst({ where: { slug: 'home-cook-chef' } });
    if (!category) {
      category = await prisma.category.findFirst();
    }
    subcategory = await prisma.subcategory.findFirst({ where: { categoryId: category.id } });
    city = await prisma.city.findFirst({ where: { slug: 'bengaluru' } });

    // 2. Create customer
    const custPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    customerUser = await prisma.user.create({
      data: {
        firstName: 'Vikram',
        lastName: 'Malhotra',
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

    // 3. Create Professional A (Will be hired)
    const profAPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    profAUser = await prisma.user.create({
      data: {
        firstName: 'Chef Anand',
        lastName: 'Kumar',
        phone: profAPhone,
        status: 'ACTIVE',
      },
    });
    profAProfile = await prisma.professionalProfile.create({
      data: {
        userId: profAUser.id,
        title: 'Executive Continental Chef',
        yearsOfExperience: 10,
        hourlyRate: 1200,
      },
    });
    await prisma.creditWallet.create({
      data: {
        professionalProfileId: profAProfile.id,
        balance: 50,
        lifetimePurchased: 50,
        lifetimeSpent: 0,
      },
    });

    // 4. Create Professional B (Candidate not hired -> must be automatically refunded)
    const profBPhone = `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    profBUser = await prisma.user.create({
      data: {
        firstName: 'Chef Priya',
        lastName: 'Rao',
        phone: profBPhone,
        status: 'ACTIVE',
      },
    });
    profBProfile = await prisma.professionalProfile.create({
      data: {
        userId: profBUser.id,
        title: 'Gourmet Indian Chef',
        yearsOfExperience: 8,
        hourlyRate: 1000,
      },
    });
    await prisma.creditWallet.create({
      data: {
        professionalProfileId: profBProfile.id,
        balance: 50,
        lifetimePurchased: 50,
        lifetimeSpent: 0,
      },
    });

    // 5. Customer posts a requirement (Budget ₹1,000 -> 10 application credits)
    requirement = await prisma.requirement.create({
      data: {
        customerId: customerProfile.id,
        categoryId: category.id,
        subcategoryId: subcategory.id,
        cityId: city.id,
        title: 'Private Chef for Dinner Party (8 Guests)',
        description: 'Looking for continental multi-course dinner service.',
        budgetMin: 1000,
        budgetMax: 1000,
        status: 'PUBLISHED',
      },
    });

    // 6. Professional A applies (deduct 10 credits)
    await CreditService.deductCreditsForApplication(profAProfile.id, requirement.id, 10);
    appA = await prisma.application.create({
      data: {
        requirementId: requirement.id,
        professionalProfileId: profAProfile.id,
        creditsCharged: 10,
        creditsSpent: 10,
        status: 'SHORTLISTED',
        isRefunded: false,
      },
    });
    quoteA = await prisma.quotation.create({
      data: {
        requirementId: requirement.id,
        professionalProfileId: profAProfile.id,
        applicationId: appA.id,
        proposedPrice: 1200,
        currency: 'INR',
        estimatedTimeline: '1 day',
        message: '3-course continental dinner with plating',
        status: 'SUBMITTED',
      },
    });

    // 7. Professional B applies (deduct 10 credits)
    await CreditService.deductCreditsForApplication(profBProfile.id, requirement.id, 10);
    appB = await prisma.application.create({
      data: {
        requirementId: requirement.id,
        professionalProfileId: profBProfile.id,
        creditsCharged: 10,
        creditsSpent: 10,
        status: 'SUBMITTED',
        isRefunded: false,
      },
    });
    quoteB = await prisma.quotation.create({
      data: {
        requirementId: requirement.id,
        professionalProfileId: profBProfile.id,
        applicationId: appB.id,
        proposedPrice: 1000,
        currency: 'INR',
        estimatedTimeline: '1 day',
        message: '4-course feast with dessert',
        status: 'SUBMITTED',
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test records in safe foreign key dependency order
    await prisma.job.deleteMany({
      where: { requirementId: requirement?.id },
    });
    await prisma.creditLedger.deleteMany({
      where: {
        professionalProfileId: { in: [profAProfile?.id, profBProfile?.id].filter(Boolean) },
      },
    });
    await prisma.quotation.deleteMany({
      where: { requirementId: requirement?.id },
    });
    await prisma.application.deleteMany({
      where: { requirementId: requirement?.id },
    });
    await prisma.requirement.deleteMany({
      where: { id: requirement?.id },
    });
    await prisma.creditWallet.deleteMany({
      where: {
        professionalProfileId: { in: [profAProfile?.id, profBProfile?.id].filter(Boolean) },
      },
    });
    await prisma.professionalProfile.deleteMany({
      where: { id: { in: [profAProfile?.id, profBProfile?.id].filter(Boolean) } },
    });
    await prisma.customerProfile.deleteMany({
      where: { id: customerProfile?.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [customerUser?.id, profAUser?.id, profBUser?.id].filter(Boolean) } },
    });
  });

  it('1. Verifies initial balances: both professionals had 50, spent 10, now have 40', async () => {
    const walletA = await prisma.creditWallet.findUnique({
      where: { professionalProfileId: profAProfile.id },
    });
    const walletB = await prisma.creditWallet.findUnique({
      where: { professionalProfileId: profBProfile.id },
    });

    expect(walletA?.balance).toBe(40);
    expect(walletB?.balance).toBe(40);
  });

  it('2. Customer hires Professional A: Automatically triggers 100% refund for Professional B', async () => {
    // Invoke the refund engine for non-hired applicants
    const refundResults = await CreditService.refundNonHiredApplicants(requirement.id, profAProfile.id);

    expect(refundResults.length).toBe(1);
    expect(refundResults[0].creditsRefunded).toBe(10);
    expect(refundResults[0].alreadyRefunded).toBe(false);

    // Mark requirement as IN_PROGRESS as hiring completes
    await prisma.requirement.update({
      where: { id: requirement.id },
      data: { status: 'IN_PROGRESS' },
    });

    // Verify Professional B Application state
    const updatedAppB = await prisma.application.findUnique({
      where: { id: appB.id },
    });
    expect(updatedAppB?.isRefunded).toBe(true);
    expect(updatedAppB?.creditsRefunded).toBe(10);
    expect(updatedAppB?.refundStatus).toBe('REFUNDED');
    expect(updatedAppB?.refundReason).toBe('NOT_SELECTED');
    expect(updatedAppB?.refundedAt).not.toBeNull();

    // Verify Professional B Wallet balance was restored to 50
    const walletB = await prisma.creditWallet.findUnique({
      where: { professionalProfileId: profBProfile.id },
    });
    expect(walletB?.balance).toBe(50);

    // Verify immutable CreditLedger record exists for Professional B with direction: 'CREDIT'
    const ledgerB = await prisma.creditLedger.findFirst({
      where: {
        professionalProfileId: profBProfile.id,
        transactionType: 'APPLICATION_REFUND',
      },
    });
    expect(ledgerB).not.toBeNull();
    expect(ledgerB?.amount).toBe(10);
    expect(ledgerB?.direction).toBe('CREDIT');
    expect(ledgerB?.balanceAfter).toBe(50);
  });

  it('3. Refund Idempotency: Secondary refund attempts safely return alreadyRefunded: true', async () => {
    const secondAttempt = await CreditService.refundApplication(appB.id, 'NOT_SELECTED');

    expect(secondAttempt.alreadyRefunded).toBe(true);
    expect(secondAttempt.creditsRefunded).toBe(10);

    // Wallet balance should strictly remain 50 (NO duplicate refund)
    const walletB = await prisma.creditWallet.findUnique({
      where: { professionalProfileId: profBProfile.id },
    });
    expect(walletB?.balance).toBe(50);
  });

  it('4. Expired Requirement Worker: Automatically refunds unhired candidates when requirement expires', async () => {
    // Create an expired requirement with an active applicant
    const expiredReq = await prisma.requirement.create({
      data: {
        customerId: customerProfile.id,
        categoryId: category.id,
        subcategoryId: subcategory.id,
        cityId: city.id,
        title: 'Past Expired Event Requirement',
        description: 'Testing background expiry worker',
        budgetMin: 500,
        budgetMax: 500,
        status: 'PUBLISHED',
        expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // Expired 1 day ago
      },
    });

    // Professional A applies to this requirement
    await CreditService.deductCreditsForApplication(profAProfile.id, expiredReq.id, 5);
    const expiredApp = await prisma.application.create({
      data: {
        requirementId: expiredReq.id,
        professionalProfileId: profAProfile.id,
        creditsCharged: 5,
        creditsSpent: 5,
        status: 'SUBMITTED',
        isRefunded: false,
      },
    });

    const initialWalletA = await prisma.creditWallet.findUnique({
      where: { professionalProfileId: profAProfile.id },
    });
    expect(initialWalletA?.balance).toBe(35); // 40 - 5 = 35

    // Run expiry worker
    const expiryResults = await CreditService.processExpiredRequirements(0);
    expect(expiryResults.some((r) => r.requirementId === expiredReq.id)).toBe(true);

    // Verify requirement is marked EXPIRED
    const refreshedReq = await prisma.requirement.findUnique({
      where: { id: expiredReq.id },
    });
    expect(refreshedReq?.status).toBe('EXPIRED');

    // Verify application is refunded with reason REQUIREMENT_EXPIRED
    const refreshedApp = await prisma.application.findUnique({
      where: { id: expiredApp.id },
    });
    expect(refreshedApp?.isRefunded).toBe(true);
    expect(refreshedApp?.creditsRefunded).toBe(5);
    expect(refreshedApp?.refundReason).toBe('REQUIREMENT_EXPIRED');

    // Verify Professional A wallet restored by 5 credits (35 + 5 = 40)
    const finalWalletA = await prisma.creditWallet.findUnique({
      where: { professionalProfileId: profAProfile.id },
    });
    expect(finalWalletA?.balance).toBe(40);

    // Clean up expired test requirement
    await prisma.creditLedger.deleteMany({ where: { requirementId: expiredReq.id } });
    await prisma.application.deleteMany({ where: { requirementId: expiredReq.id } });
    await prisma.requirement.delete({ where: { id: expiredReq.id } });
  });

  it('5. Dual Status Progression: Work Status (Professional) vs Payment Status (Customer)', async () => {
    // Create Job for Professional A
    const job = await prisma.job.create({
      data: {
        requirementId: requirement.id,
        customerId: customerProfile.id,
        professionalProfileId: profAProfile.id,
        quotationId: quoteA.id,
        agreedPrice: quoteA.proposedPrice,
        workStatus: 'PREPARING',
        paymentStatus: 'PAYMENT_PENDING',
        status: 'PREPARING',
      },
    });

    expect(job.workStatus).toBe('PREPARING');
    expect(job.paymentStatus).toBe('PAYMENT_PENDING');

    // Step A: Customer deposits escrow
    const securedJob = await prisma.job.update({
      where: { id: job.id },
      data: { paymentStatus: 'PAYMENT_SECURED' },
    });
    expect(securedJob.paymentStatus).toBe('PAYMENT_SECURED');

    // Step B: Professional advances operational work stages
    const onTheWayJob = await prisma.job.update({
      where: { id: job.id },
      data: { workStatus: 'ON_THE_WAY', status: 'ON_THE_WAY' },
    });
    expect(onTheWayJob.workStatus).toBe('ON_THE_WAY');

    const completedJob = await prisma.job.update({
      where: { id: job.id },
      data: { workStatus: 'WORK_COMPLETED', status: 'SERVICE_COMPLETED' },
    });
    expect(completedJob.workStatus).toBe('WORK_COMPLETED');

    // Step C: Customer confirms completion -> moves to READY_FOR_RELEASE
    const confirmedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        paymentStatus: 'READY_FOR_RELEASE',
        customerConfirmedAt: new Date(),
        status: 'CUSTOMER_APPROVED',
      },
    });
    expect(confirmedJob.paymentStatus).toBe('READY_FOR_RELEASE');
    expect(confirmedJob.customerConfirmedAt).not.toBeNull();

    // Step D: Payment released to professional
    const releasedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        paymentStatus: 'RELEASED',
        status: 'COMPLETED',
      },
    });
    expect(releasedJob.paymentStatus).toBe('RELEASED');
    expect(releasedJob.status).toBe('COMPLETED');
  });

  it('6. Professional Transaction History provides unified chronological ledger and balances', async () => {
    const history = await CreditService.getProfessionalTransactionHistory(profBProfile.id);

    expect(history.transactions).toBeDefined();
    expect(history.transactions.length).toBeGreaterThanOrEqual(2); // Application debit + refund

    const refundTx = history.transactions.find((t) => t.type === 'APPLICATION_CREDIT_REFUND');
    expect(refundTx).toBeDefined();
    expect(refundTx?.direction).toBe('CREDIT');
    expect(refundTx?.rawAmount).toBe(10);
    expect(refundTx?.displayType).toBe('Credits Refunded');
    expect(refundTx?.balanceAfter).toBe(50);
  });
});
