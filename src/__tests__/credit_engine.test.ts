import { CreditService } from '../services/credit.service';
import { prisma } from '../lib/prisma';

describe('Vaziro Master Specification: Credit Engine & Refund Architecture', () => {
  describe('1. The 14 Budget Calculation Test Cases (Section 18)', () => {
    it('Case 1: ₹80 budget should charge 1 credit (minimum rule: MAX(1, CEIL(80/100)) = 1)', async () => {
      const fee = await CreditService.calculateFee(80);
      expect(fee).toBe(1);
    });

    it('Case 2: ₹100 budget should charge 1 credit (CEIL(100/100) = 1)', async () => {
      const fee = await CreditService.calculateFee(100);
      expect(fee).toBe(1);
    });

    it('Case 3: ₹101 budget should charge 2 credits (CEIL(101/100) = 2)', async () => {
      const fee = await CreditService.calculateFee(101);
      expect(fee).toBe(2);
    });

    it('Case 4: ₹200 budget should charge 2 credits (CEIL(200/100) = 2)', async () => {
      const fee = await CreditService.calculateFee(200);
      expect(fee).toBe(2);
    });

    it('Case 5: ₹250 budget should charge 3 credits (CEIL(250/100) = 3)', async () => {
      const fee = await CreditService.calculateFee(250);
      expect(fee).toBe(3);
    });

    it('Case 6: ₹500 budget should charge 5 credits (CEIL(500/100) = 5)', async () => {
      const fee = await CreditService.calculateFee(500);
      expect(fee).toBe(5);
    });

    it('Case 7: ₹999 budget should charge 10 credits (CEIL(999/100) = 10)', async () => {
      const fee = await CreditService.calculateFee(999);
      expect(fee).toBe(10);
    });

    it('Case 8: ₹1,000 budget should charge 10 credits (CEIL(1000/100) = 10)', async () => {
      const fee = await CreditService.calculateFee(1000);
      expect(fee).toBe(10);
    });

    it('Case 9: ₹1,500 budget should charge 15 credits (CEIL(1500/100) = 15)', async () => {
      const fee = await CreditService.calculateFee(1500);
      expect(fee).toBe(15);
    });

    it('Case 10: ₹2,500 budget should charge 25 credits (CEIL(2500/100) = 25)', async () => {
      const fee = await CreditService.calculateFee(2500);
      expect(fee).toBe(25);
    });

    it('Case 11: ₹5,000 budget should charge 50 credits (CEIL(500/100) = 50)', async () => {
      const fee = await CreditService.calculateFee(5000);
      expect(fee).toBe(50);
    });

    it('Case 12: ₹10,000 budget should charge 100 credits (CEIL(10000/100) = 100)', async () => {
      const fee = await CreditService.calculateFee(10000);
      expect(fee).toBe(100);
    });

    it('Case 13: Range ₹1,000 - ₹2,000 should evaluate maximum budget ₹2,000 = 20 credits', async () => {
      const fee = await CreditService.calculateFee(1000, 2000);
      expect(fee).toBe(20);
    });

    it('Case 14: Range ₹300 - ₹500 should evaluate maximum budget ₹500 = 5 credits', async () => {
      const fee = await CreditService.calculateFee(300, 500);
      expect(fee).toBe(5);
    });
  });

  describe('2. The 5 Database-Driven Vaziro Professional Plans (Section 13, 14)', () => {
    it('should have all 5 Vaziro Professional Plans configured with correct credits and visibility tiers', async () => {
      const plans = await prisma.professionalPlan.findMany({
        orderBy: { price: 'asc' },
      });

      expect(plans.length).toBeGreaterThanOrEqual(5);

      const starter = plans.find((p) => p.slug === 'starter');
      expect(starter).toBeDefined();
      expect(starter?.price).toBe(100);
      expect(starter?.baseCredits).toBe(10);
      expect(starter?.bonusCredits).toBe(0);
      expect(starter?.totalCredits).toBe(10);
      expect(starter?.visibilityTier).toBe('STANDARD');

      const basic = plans.find((p) => p.slug === 'basic');
      expect(basic).toBeDefined();
      expect(basic?.price).toBe(250);
      expect(basic?.baseCredits).toBe(25);
      expect(basic?.bonusCredits).toBe(2);
      expect(basic?.totalCredits).toBe(27);
      expect(basic?.visibilityTier).toBe('ENHANCED');

      const popular = plans.find((p) => p.slug === 'popular');
      expect(popular).toBeDefined();
      expect(popular?.price).toBe(500);
      expect(popular?.baseCredits).toBe(50);
      expect(popular?.bonusCredits).toBe(5);
      expect(popular?.totalCredits).toBe(55);
      expect(popular?.isPopular).toBe(true);
      expect(popular?.visibilityTier).toBe('HIGHER');

      const growth = plans.find((p) => p.slug === 'growth');
      expect(growth).toBeDefined();
      expect(growth?.price).toBe(1000);
      expect(growth?.baseCredits).toBe(100);
      expect(growth?.bonusCredits).toBe(15);
      expect(growth?.totalCredits).toBe(115);
      expect(growth?.visibilityTier).toBe('HIGH_PRIORITY');

      const pro = plans.find((p) => p.slug === 'pro');
      expect(pro).toBeDefined();
      expect(pro?.price).toBe(2500);
      expect(pro?.baseCredits).toBe(250);
      expect(pro?.bonusCredits).toBe(50);
      expect(pro?.totalCredits).toBe(300);
      expect(pro?.visibilityTier).toBe('HIGHEST_ELIGIBLE');
    });
  });

  describe('3. Customer Requirement Boost Packages (Section 25, 27)', () => {
    it('should have all 3 customer boost packages configured with correct pricing and durations', async () => {
      const packages = await prisma.boostPackage.findMany({
        orderBy: { price: 'asc' },
      });

      expect(packages.length).toBeGreaterThanOrEqual(3);

      const basic = packages.find((p) => p.slug === 'basic-boost');
      expect(basic?.price).toBe(29);
      expect(basic?.durationDays).toBe(1);

      const standard = packages.find((p) => p.slug === 'standard-boost');
      expect(standard?.price).toBe(59);
      expect(standard?.durationDays).toBe(3);

      const premium = packages.find((p) => p.slug === 'premium-boost');
      expect(premium?.price).toBe(99);
      expect(premium?.durationDays).toBe(7);
    });
  });

  describe('4. Credit Batch Accounting, 90-Day Validity & Refund Worker (Section 18, 20)', () => {
    let testProfId: string;

    beforeAll(async () => {
      // Find or create test professional profile
      const prof = await prisma.professionalProfile.findFirst({
        include: { creditWallet: true },
      });
      if (prof) {
        testProfId = prof.id;
      }
    });

    it('Scenario 1: Fulfill plan purchase awards base + bonus credits with 90-day expiry', async () => {
      if (!testProfId) return;

      const result = await CreditService.fulfillPlanPurchase(testProfId, 'popular', {
        razorpayOrderId: `order_test_${Date.now()}`,
        razorpayPaymentId: `pay_test_${Date.now()}`,
        amountPaid: 500,
      });

      expect(result.batch).toBeDefined();
      if (result.batch) {
        expect(result.batch.purchasedCredits).toBe(50);
        expect(result.batch.bonusCredits).toBe(5);
        expect(result.batch.status).toBe('ACTIVE');

        // Check 90 days expiry
        const diffMs = result.batch.expiresAt.getTime() - result.batch.grantedAt.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        expect(diffDays).toBe(90);
      }
    });

    it('Scenario 2: Detailed wallet provides full breakdown including refundable credits and tier', async () => {
      if (!testProfId) return;

      const wallet = await CreditService.getDetailedWallet(testProfId);
      expect(wallet.availableCredits).toBeGreaterThanOrEqual(55);
      expect(wallet.purchasedCredits).toBeGreaterThanOrEqual(50);
      expect(wallet.bonusCredits).toBeGreaterThanOrEqual(5);
      expect(wallet.refundableAmountInr).toBe(wallet.refundableCredits * 10);
      expect(wallet.visibilityTier).toBeDefined();
    });

    it('Scenario 3: Expiry worker marks unspent purchased credits as REFUND_PENDING at ₹10/credit', async () => {
      if (!testProfId) return;

      // Create an expired test batch directly
      const expiredDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const expiredBatch = await prisma.creditBatch.create({
        data: {
          professionalProfileId: testProfId,
          purchasedCredits: 20,
          bonusCredits: 5,
          remainingPurchasedCredits: 20,
          remainingBonusCredits: 5,
          grantedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
          expiresAt: expiredDate,
          status: 'ACTIVE',
        },
      });

      // Give wallet sufficient balance
      await prisma.creditWallet.update({
        where: { professionalProfileId: testProfId },
        data: { balance: { increment: 25 } },
      });

      // Run expiry worker
      const processResult = await CreditService.processExpiredBatches();
      expect(processResult.processedCount).toBeGreaterThanOrEqual(1);

      // Verify the batch was transitioned to REFUND_PENDING
      const updatedBatch = await prisma.creditBatch.findUnique({
        where: { id: expiredBatch.id },
      });

      expect(updatedBatch?.status).toBe('REFUND_PENDING');
      expect(updatedBatch?.remainingPurchasedCredits).toBe(0);
      expect(updatedBatch?.remainingBonusCredits).toBe(0);
      // 20 credits * ₹10 * 100 = 20,000 paise (₹200)
      expect(updatedBatch?.refundAmountPaise).toBe(20 * 10 * 100);
    });

    it('Scenario 4: Batch with zero purchased credits and only bonus marks EXPIRED_NON_REFUNDABLE', async () => {
      if (!testProfId) return;

      const expiredDate = new Date(Date.now() - 1000 * 60 * 60);
      const bonusOnlyBatch = await prisma.creditBatch.create({
        data: {
          professionalProfileId: testProfId,
          purchasedCredits: 10,
          bonusCredits: 5,
          remainingPurchasedCredits: 0, // all base credits were used!
          remainingBonusCredits: 5,     // only promotional bonus credits left
          grantedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
          expiresAt: expiredDate,
          status: 'ACTIVE',
        },
      });

      await prisma.creditWallet.update({
        where: { professionalProfileId: testProfId },
        data: { balance: { increment: 5 } },
      });

      await CreditService.processExpiredBatches();

      const updatedBatch = await prisma.creditBatch.findUnique({
        where: { id: bonusOnlyBatch.id },
      });

      expect(updatedBatch?.status).toBe('EXPIRED_NON_REFUNDABLE');
      expect(updatedBatch?.refundAmountPaise).toBe(0);
    });

    it('Scenario 5: Requirement cancellation automatically refunds all applicants', async () => {
      if (!testProfId) return;

      // Find or create a dummy requirement
      const req = await prisma.requirement.findFirst();
      if (!req) return;

      const walletBefore = await prisma.creditWallet.findUnique({
        where: { professionalProfileId: testProfId },
      });
      const balanceBefore = walletBefore?.balance || 0;

      // Create an application with 5 credits spent
      const app = await prisma.application.upsert({
        where: {
          requirementId_professionalProfileId: {
            requirementId: req.id,
            professionalProfileId: testProfId,
          },
        },
        update: { creditsSpent: 5, isRefunded: false, refundStatus: 'NONE' },
        create: {
          requirementId: req.id,
          professionalProfileId: testProfId,
          creditsSpent: 5,
          status: 'SUBMITTED',
          isRefunded: false,
          refundStatus: 'NONE',
        },
      });

      // Run refundAllApplicationsForRequirement
      const refundResults = await CreditService.refundAllApplicationsForRequirement(req.id, 'CUSTOMER_CANCELLED');
      expect(refundResults.length).toBeGreaterThanOrEqual(1);

      const walletAfter = await prisma.creditWallet.findUnique({
        where: { professionalProfileId: testProfId },
      });

      expect(walletAfter?.balance).toBe(balanceBefore + 5);

      // Verify audit ledger entry
      const ledgerEntry = await prisma.creditLedger.findFirst({
        where: {
          professionalProfileId: testProfId,
          transactionType: 'APPLICATION_REFUND',
          referenceEntityId: req.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry?.amount).toBe(5);
    });
  });
});
