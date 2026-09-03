export interface ISMSProvider {
  sendSMS(phone: string, message: string): Promise<boolean>;
}

export class MockSMSProvider implements ISMSProvider {
  async sendSMS(phone: string, message: string): Promise<boolean> {
    console.log(`📱 [MockSMSProvider] Sending SMS to ${phone}: "${message}"`);
    return true;
  }
}

export const smsProvider: ISMSProvider = new MockSMSProvider();
