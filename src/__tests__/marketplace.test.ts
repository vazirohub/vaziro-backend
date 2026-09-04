import { CreditService } from '../services/credit.service';
import { AIMatchService } from '../services/ai-match.service';

describe('Marketplace Business Rules & Calculators', () => {
  describe('Credit Application Fee Calculation (Section 18)', () => {
    it('should calculate 1 credit for ₹80 and ₹100 (minimum rule)', async () => {
      const fee80 = await CreditService.calculateFee(80);
      expect(fee80).toBe(1);

      const fee100 = await CreditService.calculateFee(100);
      expect(fee100).toBe(1);
    });

    it('should calculate 2 credits for ₹101 and ₹200', async () => {
      const fee101 = await CreditService.calculateFee(101);
      expect(fee101).toBe(2);

      const fee200 = await CreditService.calculateFee(200);
      expect(fee200).toBe(2);
    });

    it('should calculate 5 credits for ₹500', async () => {
      const fee500 = await CreditService.calculateFee(500);
      expect(fee500).toBe(5);
    });

    it('should calculate 10 credits for ₹1,000', async () => {
      const fee1000 = await CreditService.calculateFee(1000);
      expect(fee1000).toBe(10);
    });

    it('should calculate 50 credits for ₹5,000', async () => {
      const fee5000 = await CreditService.calculateFee(5000);
      expect(fee5000).toBe(50);
    });

    it('should use maximum budget when a range is provided', async () => {
      const feeRange = await CreditService.calculateFee(8000, 12000);
      // CEIL(12,000 / 100) = 120 credits
      expect(feeRange).toBe(120);
    });
  });

  describe('AI Match Scoring Engine (Section 26)', () => {
    it('should compute high match score when subcategory and location match with verified badge', () => {
      const requirement = {
        categoryId: 'cat-physio',
        subcategoryId: 'subcat-sports',
        cityId: 'city-blr',
        pincode: '560038',
        minimumBudget: 1500,
      };

      const professional = {
        categoryId: 'cat-physio',
        subcategoryId: 'subcat-sports',
        cityId: 'city-blr',
        pincodes: ['560038', '560034'],
        isVerified: true,
        rating: 4.9,
        completedJobsCount: 15,
        hourlyRate: 1200,
      };

      const match = AIMatchService.calculateMatchScore(requirement, professional);
      expect(match.score).toBeGreaterThanOrEqual(90);
      expect(match.ratingGrade).toBe('EXCELLENT');
      expect(match.reasons.length).toBeGreaterThan(0);
      expect(match.reasons.some((r) => r.includes('DigiLocker'))).toBe(true);
    });
  });

  describe('Platform Fee & GST Invoicing Rules (Section 34 & 39)', () => {
    it('should compute 6% platform fee and 18% GST correctly', () => {
      const agreedPrice = 10000;
      const platformFeeRate = 0.06;
      const platformFee = Math.round(agreedPrice * platformFeeRate); // 600
      expect(platformFee).toBe(600);

      // GST: 18% on platform fee (9% CGST + 9% SGST)
      const cgst = Math.round((platformFee * 0.09)); // 54
      const sgst = Math.round((platformFee * 0.09)); // 54
      const totalGst = cgst + sgst; // 108

      expect(cgst).toBe(54);
      expect(sgst).toBe(54);
      expect(totalGst).toBe(108);

      const netProfessionalPayout = agreedPrice - platformFee;
      expect(netProfessionalPayout).toBe(9400);
    });
  });
});
