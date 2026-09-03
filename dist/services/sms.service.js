"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsProvider = exports.MockSMSProvider = void 0;
class MockSMSProvider {
    async sendSMS(phone, message) {
        console.log(`📱 [MockSMSProvider] Sending SMS to ${phone}: "${message}"`);
        return true;
    }
}
exports.MockSMSProvider = MockSMSProvider;
exports.smsProvider = new MockSMSProvider();
