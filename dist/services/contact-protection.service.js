"use strict";
/**
 * Contact Protection Service
 * Protects customer & professional contact details before hire to prevent bypass,
 * fraud, scams, and ensure dispute guarantee coverage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactProtectionService = void 0;
const PHONE_REGEX = /(\+91[\-\s]?)?[6789]\d{9}|\b\d{10}\b|\b\d{5}[\s\-]\d{5}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const WHATSAPP_HANDLE_REGEX = /(wa\.me\/\d+|whatsapp:\s*\+?\d{10,})/gi;
class ContactProtectionService {
    static isProtectionEnabled() {
        return process.env.CONTACT_PROTECTION_ENABLED !== 'false';
    }
    static isSharingAllowedAfterHire() {
        return process.env.CONTACT_SHARING_ALLOWED_AFTER_HIRE !== 'false';
    }
    /**
     * Inspects message content for sensitive contact info and applies
     * configurable policy based on hiring status.
     */
    static inspect(content, isHired) {
        if (!this.isProtectionEnabled()) {
            return {
                sanitizedContent: content,
                hasContactInfo: false,
                warningMessage: null,
            };
        }
        const hasPhone = PHONE_REGEX.test(content);
        // Reset regex index state
        PHONE_REGEX.lastIndex = 0;
        const hasEmail = EMAIL_REGEX.test(content);
        EMAIL_REGEX.lastIndex = 0;
        const hasWhatsApp = WHATSAPP_HANDLE_REGEX.test(content);
        WHATSAPP_HANDLE_REGEX.lastIndex = 0;
        const hasContactInfo = hasPhone || hasEmail || hasWhatsApp;
        // If hired and post-hire sharing is allowed, pass through naturally
        if (isHired && this.isSharingAllowedAfterHire()) {
            return {
                sanitizedContent: content,
                hasContactInfo,
                warningMessage: null,
            };
        }
        if (hasContactInfo) {
            let sanitized = content
                .replace(PHONE_REGEX, '[Phone Number Protected by Vaziro - Available After Hiring]')
                .replace(EMAIL_REGEX, '[Email Protected by Vaziro - Available After Hiring]')
                .replace(WHATSAPP_HANDLE_REGEX, '[WhatsApp Protected by Vaziro]');
            return {
                sanitizedContent: sanitized,
                hasContactInfo: true,
                warningMessage: 'For your safety, please keep communication on Vaziro until you hire a professional. All bookings made on Vaziro are covered by Payment Protection.',
            };
        }
        return {
            sanitizedContent: content,
            hasContactInfo: false,
            warningMessage: null,
        };
    }
}
exports.ContactProtectionService = ContactProtectionService;
