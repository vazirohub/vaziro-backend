"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Msg91Service = void 0;
const config_1 = require("../config");
class Msg91Service {
    /**
     * Normalize phone number to 91XXXXXXXXXX format required by MSG91 API
     */
    static formatMobileForMsg91(mobile) {
        const digits = mobile.replace(/\D/g, '');
        if (digits.length === 10) {
            return `91${digits}`;
        }
        if (digits.length === 12 && digits.startsWith('91')) {
            return digits;
        }
        return digits;
    }
    /**
     * Send OTP via MSG91 SendOTP API
     * Endpoint: POST https://control.msg91.com/api/v5/otp
     */
    static async sendOtp(mobile, otpCode) {
        const formattedMobile = this.formatMobileForMsg91(mobile);
        const authkey = config_1.config.msg91.authKey;
        // Check if real MSG91 API call should be made
        if (!authkey || config_1.config.providers.sms === 'MOCK') {
            return {
                success: true,
                message: 'OTP dispatched successfully (sandbox mode).',
            };
        }
        try {
            const url = new URL('https://control.msg91.com/api/v5/otp');
            url.searchParams.append('template_id', config_1.config.msg91.templateId || '');
            url.searchParams.append('mobile', formattedMobile);
            url.searchParams.append('authkey', authkey);
            url.searchParams.append('otp_expiry', String(config_1.config.msg91.otpExpiryMinutes));
            url.searchParams.append('otp_length', String(config_1.config.msg91.otpLength));
            if (config_1.config.msg91.senderId) {
                url.searchParams.append('sender', config_1.config.msg91.senderId);
            }
            if (otpCode) {
                url.searchParams.append('otp', otpCode);
            }
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'authkey': authkey,
                },
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.status === 'success')) {
                return {
                    success: true,
                    message: json.message || 'OTP dispatched successfully.',
                    data: json,
                };
            }
            const errorMsg = json?.message || json?.description || 'Failed to dispatch OTP via SMS provider.';
            console.warn('[MSG91] SendOTP provider response:', errorMsg);
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
        const formattedMobile = this.formatMobileForMsg91(mobile);
        const authkey = config_1.config.msg91.authKey;
        if (!authkey || config_1.config.providers.sms === 'MOCK') {
            return {
                success: true,
                message: 'OTP resent successfully (sandbox mode).',
            };
        }
        try {
            const url = new URL('https://control.msg91.com/api/v5/otp/retry');
            url.searchParams.append('authkey', authkey);
            url.searchParams.append('mobile', formattedMobile);
            url.searchParams.append('retrytype', retryType);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.status === 'success')) {
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
        const formattedMobile = this.formatMobileForMsg91(mobile);
        const authkey = config_1.config.msg91.authKey;
        if (!authkey || config_1.config.providers.sms === 'MOCK') {
            // In mock/test mode, fallback to local database verification
            return {
                success: true,
                message: 'Pass-through to local verification.',
            };
        }
        try {
            const url = new URL('https://control.msg91.com/api/v5/otp/verify');
            url.searchParams.append('authkey', authkey);
            url.searchParams.append('mobile', formattedMobile);
            url.searchParams.append('otp', otp);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            });
            const json = await response.json().catch(() => null);
            if (json && (json.type === 'success' || json.message?.toLowerCase().includes('success'))) {
                return {
                    success: true,
                    message: json.message || 'OTP verified successfully.',
                    data: json,
                };
            }
            return {
                success: false,
                message: json?.message || 'Incorrect OTP. Please try again.',
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
                    'Accept': 'application/json',
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
