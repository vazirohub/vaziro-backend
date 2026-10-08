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
        // Check existing columns for User table
        const userCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(User)`)).catch(() => []);
        const userColNames = new Set((userCols || []).map((c) => c.name?.toLowerCase()));
        if (!userColNames.has('emailverifiedat')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE User ADD COLUMN emailVerifiedAt DATETIME`)).catch(() => { });
        }
        if (!userColNames.has('phoneverifiedat')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE User ADD COLUMN phoneVerifiedAt DATETIME`)).catch(() => { });
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
        // Check ChatThread columns
        const threadCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(ChatThread)`)).catch(() => []);
        const threadColNames = new Set((threadCols || []).map((c) => c.name?.toLowerCase()));
        if (!threadColNames.has('status')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE ChatThread ADD COLUMN status TEXT DEFAULT 'ACTIVE'`)).catch(() => { });
        }
        if (!threadColNames.has('lastmessageat')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE ChatThread ADD COLUMN lastMessageAt DATETIME`)).catch(() => { });
        }
        // Check ChatParticipant columns
        const partCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(ChatParticipant)`)).catch(() => []);
        const partColNames = new Set((partCols || []).map((c) => c.name?.toLowerCase()));
        if (!partColNames.has('isblocked')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE ChatParticipant ADD COLUMN isBlocked BOOLEAN DEFAULT 0`)).catch(() => { });
        }
        if (!partColNames.has('isarchived')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE ChatParticipant ADD COLUMN isArchived BOOLEAN DEFAULT 0`)).catch(() => { });
        }
        // Check Message columns
        const msgCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(Message)`)).catch(() => []);
        const msgColNames = new Set((msgCols || []).map((c) => c.name?.toLowerCase()));
        if (!msgColNames.has('status')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE Message ADD COLUMN status TEXT DEFAULT 'SENT'`)).catch(() => { });
        }
        if (!msgColNames.has('iscontactwarning')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE Message ADD COLUMN isContactWarning BOOLEAN DEFAULT 0`)).catch(() => { });
        }
        if (!msgColNames.has('updatedat')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE Message ADD COLUMN updatedAt DATETIME`)).catch(() => { });
        }
        if (!msgColNames.has('deletedat')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE Message ADD COLUMN deletedAt DATETIME`)).catch(() => { });
        }
        // Check MessageAttachment columns
        const attCols = await withTimeout(prisma_1.prisma.$queryRawUnsafe(`PRAGMA table_info(MessageAttachment)`)).catch(() => []);
        const attColNames = new Set((attCols || []).map((c) => c.name?.toLowerCase()));
        if (!attColNames.has('filename')) {
            await withTimeout(prisma_1.prisma.$executeRawUnsafe(`ALTER TABLE MessageAttachment ADD COLUMN fileName TEXT`)).catch(() => { });
        }
        // Ensure CallRequest table exists
        await withTimeout(prisma_1.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS CallRequest (
        id TEXT PRIMARY KEY,
        chatThreadId TEXT,
        jobId TEXT,
        requirementId TEXT,
        requesterUserId TEXT NOT NULL,
        receiverUserId TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING',
        requestedDate DATETIME NOT NULL,
        requestedStartTime TEXT NOT NULL,
        requestedEndTime TEXT,
        message TEXT,
        acceptedAt DATETIME,
        declinedAt DATETIME,
        cancelledAt DATETIME,
        completedAt DATETIME,
        expiresAt DATETIME,
        callSessionId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`)).catch(() => { });
        // Ensure ConversationReport table exists
        await withTimeout(prisma_1.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ConversationReport (
        id TEXT PRIMARY KEY,
        chatThreadId TEXT,
        messageId TEXT,
        reporterUserId TEXT NOT NULL,
        reportedUserId TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'OPEN',
        adminNotes TEXT,
        resolvedByUserId TEXT,
        resolvedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`)).catch(() => { });
        // Ensure ConversationBlock table exists
        await withTimeout(prisma_1.prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ConversationBlock (
        id TEXT PRIMARY KEY,
        chatThreadId TEXT,
        blockerUserId TEXT NOT NULL,
        blockedUserId TEXT NOT NULL,
        reason TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(blockerUserId, blockedUserId)
      )`)).catch(() => { });
    }
    catch {
        // Fallback: ignore any migration check issues
    }
    migrated = true;
}
