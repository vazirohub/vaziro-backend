"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDatabaseSchema = ensureDatabaseSchema;
const prisma_1 = require("./prisma");
let migrated = false;
function withTimeout(promise, ms = 2500) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Migration query timeout')), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timer);
    });
}
/**
 * Automatically ensures SQLite / MySQL tables and columns exist.
 * Runs non-destructive ALTER TABLE and CREATE TABLE statements so that
 * live databases never crash due to missing columns or unmigrated schemas.
 */
async function ensureDatabaseSchema() {
    if (migrated)
        return;
    // Short delay in production so Express server completes initial boot cleanly
    if (process.env.NODE_ENV !== 'test') {
        await new Promise((r) => setTimeout(r, 1500));
    }
    try {
        // Only run PRAGMA checks if using SQLite
        const dbUrl = process.env.DATABASE_URL || '';
        if (dbUrl.includes('mysql://') || dbUrl.includes('postgres')) {
            migrated = true;
            return;
        }
        // Check existing columns for OtpVerification with safe timeout
        const otpCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(OtpVerification)`)).catch(() => []);
        const otpColNames = new Set((otpCols || []).map((c) => c.name?.toLowerCase()));
        if (!otpColNames.has('purpose')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE OtpVerification ADD COLUMN purpose TEXT DEFAULT 'login'`)).catch(() => { });
        }
        if (!otpColNames.has('verifiedat')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE OtpVerification ADD COLUMN verifiedAt DATETIME`)).catch(() => { });
        }
        // Check existing columns for Payment
        const paymentCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(Payment)`)).catch(() => []);
        const paymentColNames = new Set((paymentCols || []).map((c) => c.name?.toLowerCase()));
        const paymentAdditions = [
            ['userid', `ALTER TABLE Payment ADD COLUMN userId TEXT`],
            ['orderid', `ALTER TABLE Payment ADD COLUMN orderId TEXT`],
            ['razorpayorderid', `ALTER TABLE Payment ADD COLUMN razorpayOrderId TEXT`],
            ['razorpaypaymentid', `ALTER TABLE Payment ADD COLUMN razorpayPaymentId TEXT`],
            ['razorpaysignature', `ALTER TABLE Payment ADD COLUMN razorpaySignature TEXT`],
            ['failurecode', `ALTER TABLE Payment ADD COLUMN failureCode TEXT`],
            ['failurereason', `ALTER TABLE Payment ADD COLUMN failureReason TEXT`],
            ['capturedat', `ALTER TABLE Payment ADD COLUMN capturedAt DATETIME`],
        ];
        for (const [col, sql] of paymentAdditions) {
            if (!paymentColNames.has(col)) {
                await withTimeout(prisma_1.prisma.$executeRawUnsafe(sql)).catch(() => { });
            }
        }
        // Check existing columns for Verification table
        const verifCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(Verification)`)).catch(() => []);
        const verifColNames = new Set((verifCols || []).map((c) => c.name?.toLowerCase()));
        const verifAdditions = [
            ['requestid', `ALTER TABLE Verification ADD COLUMN requestId TEXT`],
            ['transactionid', `ALTER TABLE Verification ADD COLUMN transactionId TEXT`],
            ['verificationreference', `ALTER TABLE Verification ADD COLUMN verificationReference TEXT`],
            ['documenttype', `ALTER TABLE Verification ADD COLUMN documentType TEXT DEFAULT 'AADHAAR'`],
            ['namematchstatus', `ALTER TABLE Verification ADD COLUMN nameMatchStatus TEXT`],
            ['dobmatchstatus', `ALTER TABLE Verification ADD COLUMN dobMatchStatus TEXT`],
            ['expiresat', `ALTER TABLE Verification ADD COLUMN expiresAt DATETIME`],
            ['failurereason', `ALTER TABLE Verification ADD COLUMN failureReason TEXT`],
            ['reviewreason', `ALTER TABLE Verification ADD COLUMN reviewReason TEXT`],
            ['rejectionreason', `ALTER TABLE Verification ADD COLUMN rejectionReason TEXT`],
            ['providerresponse', `ALTER TABLE Verification ADD COLUMN providerResponse TEXT`],
            ['attemptcount', `ALTER TABLE Verification ADD COLUMN attemptCount INTEGER DEFAULT 0`],
            ['lastattemptat', `ALTER TABLE Verification ADD COLUMN lastAttemptAt DATETIME`],
        ];
        for (const [col, sql] of verifAdditions) {
            if (!verifColNames.has(col)) {
                await withTimeout(prisma_1.prisma.$executeRawUnsafe(sql)).catch(() => { });
            }
        }
        // Check existing columns for ProfessionalProfile table
        const profCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(ProfessionalProfile)`)).catch(() => []);
        const profColNames = new Set((profCols || []).map((c) => c.name?.toLowerCase()));
        const profAdditions = [
            ['slug', `ALTER TABLE ProfessionalProfile ADD COLUMN slug TEXT`],
            ['profilestrength', `ALTER TABLE ProfessionalProfile ADD COLUMN profileStrength REAL DEFAULT 0.0`],
            ['trustscore', `ALTER TABLE ProfessionalProfile ADD COLUMN trustScore REAL DEFAULT 0.0`],
            ['categoryid', `ALTER TABLE ProfessionalProfile ADD COLUMN categoryId TEXT`],
            ['subcategoryid', `ALTER TABLE ProfessionalProfile ADD COLUMN subcategoryId TEXT`],
            ['availabilitystatus', `ALTER TABLE ProfessionalProfile ADD COLUMN availabilityStatus TEXT DEFAULT 'AVAILABLE'`],
            ['workingdays', `ALTER TABLE ProfessionalProfile ADD COLUMN workingDays TEXT`],
            ['workinghours', `ALTER TABLE ProfessionalProfile ADD COLUMN workingHours TEXT`],
            ['workingpreferences', `ALTER TABLE ProfessionalProfile ADD COLUMN workingPreferences TEXT`],
            ['qualifications', `ALTER TABLE ProfessionalProfile ADD COLUMN qualifications TEXT`],
            ['servicedescription', `ALTER TABLE ProfessionalProfile ADD COLUMN serviceDescription TEXT`],
            ['experiencedescription', `ALTER TABLE ProfessionalProfile ADD COLUMN experienceDescription TEXT`],
            ['visibility', `ALTER TABLE ProfessionalProfile ADD COLUMN visibility TEXT DEFAULT 'PUBLIC'`],
        ];
        for (const [col, sql] of profAdditions) {
            if (!profColNames.has(col)) {
                await withTimeout(prisma_1.prisma.$executeRawUnsafe(sql)).catch(() => { });
            }
        }
        // Ensure WebhookEvent table exists
        await withTimeout(prisma_1.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS WebhookEvent (
        id TEXT PRIMARY KEY,
        eventId TEXT UNIQUE,
        eventType TEXT,
        payload TEXT,
        processed BOOLEAN DEFAULT 0,
        processedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`)).catch(() => { });
    }
    catch {
        // Fallback: ignore any migration check issues
    }
    migrated = true;
}
