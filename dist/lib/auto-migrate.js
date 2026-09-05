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
    // Short delay so Express server completes initial boot and first health ping cleanly
    await new Promise((r) => setTimeout(r, 1500));
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
