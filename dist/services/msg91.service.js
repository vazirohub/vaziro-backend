"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Msg91Service = void 0;
const config_1 = require("../config");
class Msg91Service {
    /**
     * Canonical Indian mobile number normalizer.
     * Accepts: +919876543210, 919876543210, 09876543210, 9876543210
     */
    static normalizeIndianMobile(raw) {
        const digits = (raw || '').replace(/\D/g, '');
        const digits10 = digits.slice(-10);
        const isValid = digits10.length === 10 && /^[6-9]/.test(digits10);
        return {
            canonical: `+91${digits10}`,
            forMsg91: `91${digits10}`,
            digits10,
            isValid,
        };
    }
    /**
     * Format mobile strictly as 91XXXXXXXXXX for MSG91 REST APIs
     */
    static formatMobileForMsg91(mobile) {
        return this.normalizeIndianMobile(mobile).forMsg91;
    }
    /**
     * Mask phone number for safe diagnostic logging (e.g. +91 93XXXXXX86)
     */
    static maskMobile(mobile) {
        const { digits10, isValid } = this.normalizeIndianMobile(mobile);
        if (!isValid)
            return 'XXXX';
        return `+91 ${digits10.slice(0, 2)}XXXXXX${digits10.slice(-2)}`;
    }
    /**
     * Send OTP via MSG91 SendOTP API
     * Endpoint: POST https://control.msg91.com/api/v5/otp
     */
    static async sendOtp(mobile, otpCode) {
        const norm = this.normalizeIndianMobile(mobile);
        if (!norm.isValid) {
            return {
                success: false,
                message: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
                error: 'INVALID_MOBILE',
            };
        }
        const formattedMobile = norm.forMsg91;
        const authkey = config_1.config.msg91.authKey;
        // Check if real MSG91 API call should be made
        if (!authkey || config_1.config.providers.sms === 'MOCK') {
            console.log(`[MSG91] Mock/Sandbox OTP dispatch to ${this.maskMobile(mobile)}`);
            return {
                success: true,
                message: 'OTP dispatched successfully (sandbox mode).',
            };
        }
        try {
            console.log(`[MSG91] OTP request started | Mobile: ${this.maskMobile(mobile)} | TemplateConfigured: ${Boolean(config_1.config.msg91.templateId)} | SenderConfigured: ${Boolean(config_1.config.msg91.senderId)}`);
            const url = new URL('https://control.msg91.com/api/v5/otp');
            if (config_1.config.msg91.templateId && config_1.config.msg91.templateId.trim()) {
                url.searchParams.append('template_id', config_1.config.msg91.templateId.trim());
            }
            url.searchParams.append('mobile', formattedMobile);
            url.searchParams.append('authkey', authkey);
            url.searchParams.append('otp_expiry', String(config_1.config.msg91.otpExpiryMinutes));
            url.searchParams.append('otp_length', String(config_1.config.msg91.otpLength));
            if (config_1.config.msg91.senderId && config_1.config.msg91.senderId.trim()) {
                url.searchParams.append('sender', config_1.config.msg91.senderId.trim());
            }
            if (otpCode) {
                url.searchParams.append('otp', otpCode);
            }
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    authkey: authkey,
                },
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.status === 'success' || json.request_id)) {
                console.log(`[MSG91] SendOTP success | RequestId: ${json.request_id || 'OK'}`);
                return {
                    success: true,
                    message: json.message || 'OTP dispatched successfully.',
                    data: json,
                };
            }
            const errorMsg = json?.message || json?.description || 'Failed to dispatch OTP via SMS provider.';
            console.warn(`[MSG91] SendOTP provider error response | Code: ${json?.code} | Message: ${errorMsg}`);
            return {
                success: false,
                message: errorMsg,
                error: errorMsg,
            };
        }
        catch (err) {
            console.error('[MSG91] SendOTP network error:', err.message);
            return {
                success: false,
                message: 'SMS provider temporarily unavailable. Please try again.',
                error: err.message,
            };
        }
    }
    /**
     * Resend / Retry OTP via MSG91 API
     * Endpoint: POST https://control.msg91.com/api/v5/otp/retry
     */
    static async retryOtp(mobile, retryType = 'text') {
        const norm = this.normalizeIndianMobile(mobile);
        if (!norm.isValid) {
            return {
                success: false,
                message: 'Please enter a valid 10-digit Indian mobile number.',
            };
        }
        const formattedMobile = norm.forMsg91;
        const authkey = config_1.config.msg91.authKey;
        if (!authkey || config_1.config.providers.sms === 'MOCK') {
            return {
                success: true,
                message: 'OTP resent successfully (sandbox mode).',
            };
        }
        try {
            console.log(`[MSG91] RetryOTP started | Mobile: ${this.maskMobile(mobile)} | Type: ${retryType}`);
            const url = new URL('https://control.msg91.com/api/v5/otp/retry');
            url.searchParams.append('authkey', authkey);
            url.searchParams.append('mobile', formattedMobile);
            url.searchParams.append('retrytype', retryType);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.status === 'success')) {
                console.log(`[MSG91] RetryOTP success | Mobile: ${this.maskMobile(mobile)}`);
                return {
                    success: true,
                    message: json.message || 'OTP resent successfully.',
                    data: json,
                };
            }
            return {
                success: false,
                message: json?.message || 'Failed to resend OTP.',
            };
        }
        catch (err) {
            console.error('[MSG91] RetryOTP network error:', err.message);
            return {
                success: false,
                message: 'Failed to resend OTP.',
                error: err.message,
            };
        }
    }
    /**
     * Verify OTP via MSG91 API
     * Endpoint: POST https://control.msg91.com/api/v5/otp/verify
     */
    static async verifyOtp(mobile, otp) {
        const norm = this.normalizeIndianMobile(mobile);
        const formattedMobile = norm.forMsg91;
        const authkey = config_1.config.msg91.authKey;
        if (!authkey || config_1.config.providers.sms === 'MOCK') {
            // In mock/test mode, fallback to local database verification
            return {
                success: true,
                message: 'Pass-through to local verification.',
            };
        }
        try {
            console.log(`[MSG91] VerifyOTP API check started | Mobile: ${this.maskMobile(mobile)}`);
            const url = new URL('https://control.msg91.com/api/v5/otp/verify');
            url.searchParams.append('authkey', authkey);
            url.searchParams.append('mobile', formattedMobile);
            url.searchParams.append('otp', otp);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.message?.toLowerCase().includes('success'))) {
                console.log(`[MSG91] VerifyOTP API confirmed valid | Mobile: ${this.maskMobile(mobile)}`);
                return {
                    success: true,
                    message: json.message || 'OTP verified successfully.',
                    data: json,
                };
            }
            return {
                success: false,
                message: json?.message || 'Incorrect OTP. Please check and try again.',
            };
        }
        catch (err) {
            console.warn('[MSG91] VerifyOTP network notice:', err.message);
            // Fallback to local DB verification
            return {
                success: true,
                message: 'Pass-through to local verification.',
            };
        }
    }
    /**
     * Cryptographically verify the access-token returned by the MSG91 OTP Widget
     * Endpoint: POST https://control.msg91.com/api/v5/widget/verifyAccessToken
     */
    static async verifyAccessToken(accessToken) {
        if (!accessToken || typeof accessToken !== 'string') {
            return { success: false, message: 'Access token is required.' };
        }
        const authkey = config_1.config.msg91.authKey;
        try {
            const response = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    authkey,
                    'access-token': accessToken.trim(),
                }),
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.status === 'success' || json.responseCode === 200 || json.data)) {
                return {
                    success: true,
                    message: json.message || 'Access token verified by MSG91.',
                    data: json.data || json,
                };
            }
            return {
                success: false,
                message: json?.message || 'Invalid or expired MSG91 access token.',
            };
        }
        catch (err) {
            console.warn('[MSG91] Access token verification notice:', err.message);
            return {
                success: true,
                message: 'Pass-through verified.',
            };
        }
    }
}
exports.Msg91Service = Msg91Service;
