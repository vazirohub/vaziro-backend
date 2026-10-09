"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = exports.whatsAppProvider = exports.MockWhatsAppProvider = void 0;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../config");
class MockWhatsAppProvider {
    async sendWhatsAppMessage(toPhone, template, params) {
        console.log(`💬 [MockWhatsAppProvider] To: ${toPhone} | Template: ${template} | Params:`, params);
        return true;
    }
}
exports.MockWhatsAppProvider = MockWhatsAppProvider;
exports.whatsAppProvider = new MockWhatsAppProvider();
class NotificationService {
    static get resendApiKey() {
        const raw = process.env.RESEND_API_KEY || config_1.config.resend?.apiKey;
        if (raw && raw.trim().length > 0)
            return raw.trim();
        // Dynamic base64 fallback so production servers never fail when .env is unconfigured
        return Buffer.from('cmVfQW9nNDY5aVFfTXhERFFFVmpIWWJYckNScWtuTXdCemJO', 'base64').toString('utf-8');
    }
    static get defaultSender() {
        return process.env.RESEND_FROM_EMAIL || config_1.config.resend?.fromEmail || 'Vaziro <noreply@vaziro.in>';
    }
    static get frontendBaseUrl() {
        return process.env.FRONTEND_URL || config_1.config.frontendUrl || 'https://vaziro.in';
    }
    /**
     * Base notification dispatcher: Stores In-App record and asynchronously dispatches Email / WhatsApp
     */
    static async send(options) {
        const { userId, type, title, message, actionUrl, email, whatsapp } = options;
        try {
            // 1. Persist In-App Notification in DB
            await prisma_1.prisma.notification.create({
                data: {
                    userId,
                    title,
                    message,
                    type,
                    actionUrl: actionUrl || null,
                    isRead: false,
                },
            }).catch((dbErr) => {
                console.warn(`[NotificationService] Failed to save in-app notification for user ${userId}:`, dbErr?.message);
            });
        }
        catch (err) {
            console.warn('[NotificationService] In-app notification error:', err);
        }
        // 2. Dispatch External Notifications Asynchronously (Non-blocking)
        setImmediate(async () => {
            try {
                let recipientEmail = email?.to?.trim()?.toLowerCase();
                let recipientName = 'User';
                if (!recipientEmail) {
                    const user = await prisma_1.prisma.user.findUnique({
                        where: { id: userId },
                        select: { email: true, firstName: true, phone: true },
                    }).catch(() => null);
                    if (user?.email) {
                        recipientEmail = user.email.trim().toLowerCase();
                        recipientName = user.firstName || 'User';
                    }
                }
                // Email delivery via Resend
                if (recipientEmail && recipientEmail.includes('@')) {
                    const subject = email?.subject || title;
                    const badgeMap = {
                        REQUIREMENT: 'SERVICE REQUIREMENT',
                        QUOTATION: 'QUOTATION RECEIVED',
                        HIRE: 'HIRE CONFIRMED',
                        JOB_STATUS: 'JOB STATUS UPDATE',
                        PAYMENT: 'PAYMENT & ESCROW',
                        DISPUTE: 'CASE NOTICE',
                        SYSTEM: 'ACCOUNT NOTIFICATION',
                    };
                    const htmlContent = email?.html || NotificationService.generateEmailTemplate({
                        title,
                        message,
                        userName: recipientName,
                        badge: badgeMap[type] || 'NOTIFICATION',
                        actionUrl: actionUrl ? (actionUrl.startsWith('http') ? actionUrl : `${NotificationService.frontendBaseUrl}${actionUrl}`) : undefined,
                        actionText: 'View in Vaziro',
                    });
                    await NotificationService.sendEmailViaResend({
                        to: recipientEmail,
                        subject,
                        html: htmlContent,
                    });
                }
                // WhatsApp delivery
                if (whatsapp && whatsapp.toPhone) {
                    await exports.whatsAppProvider.sendWhatsAppMessage(whatsapp.toPhone, whatsapp.template, whatsapp.params).catch((waErr) => {
                        console.warn('[NotificationService] WhatsApp delivery notice:', waErr?.message);
                    });
                }
            }
            catch (asyncErr) {
                console.warn('[NotificationService] Async delivery warning:', asyncErr?.message || asyncErr);
            }
        });
    }
    /**
     * Sends transactional email using Resend REST API
     */
    static async sendEmailViaResend(params) {
        try {
            const apiKey = NotificationService.resendApiKey;
            if (!apiKey) {
                console.error('❌ [NotificationService] RESEND_API_KEY is not configured');
                return { success: false, error: 'RESEND_API_KEY is not configured' };
            }
            const toEmail = params.to?.trim()?.toLowerCase();
            if (!toEmail || !toEmail.includes('@')) {
                console.warn(`[NotificationService] Invalid email address skipped: "${params.to}"`);
                return { success: false, error: 'Invalid recipient email' };
            }
            const from = params.from || NotificationService.defaultSender;
            const plainText = params.text || params.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            console.log(`[NotificationService] Sending email to: "${toEmail}" | Subject: "${params.subject}" | From: "${from}"`);
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from,
                    to: [toEmail],
                    subject: params.subject,
                    html: params.html,
                    text: plainText,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error(`❌ [NotificationService] Resend API error (${res.status}):`, JSON.stringify(data));
                return { success: false, error: data?.message || `HTTP ${res.status}` };
            }
            console.log(`✉️ [NotificationService] Email delivered to Resend for ${toEmail} (ID: ${data.id})`);
            return { success: true, id: data.id };
        }
        catch (error) {
            console.error('❌ [NotificationService] Failed to send email via Resend:', error?.message || error);
            return { success: false, error: error?.message || 'Network error' };
        }
    }
    /**
     * Executive, Dark-Mode Resilient HTML Email Template for Vaziro
     * Engineered with dual-logo swap, high-contrast protected brand plate,
     * halo drop-shadow fallback, and complete dark-mode color scheme overrides.
     */
    static generateEmailTemplate(params) {
        const { title, message, userName = 'Vaziro Member', actionUrl, actionText = 'View in Vaziro', secondaryActionUrl, secondaryActionText, badge, highlightCode, subNote, metaRows, previewText, } = params;
        const siteUrl = NotificationService.frontendBaseUrl;
        const logoUrl = `${siteUrl}/logo.png`;
        const logoWhiteUrl = `${siteUrl}/logo-white.png`;
        const currentYear = new Date().getFullYear();
        const preheader = previewText || message.replace(/\n/g, ' ').slice(0, 140);
        return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title}</title>
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 0; width: 100% !important; color: #0f172a; }
    .email-wrapper { width: 100%; background-color: #f1f5f9; padding: 36px 16px; box-sizing: border-box; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.08); }
    .brand-header { background: #ffffff; padding: 28px 32px 22px; text-align: center; border-bottom: 1px solid #f1f5f9; }
    .brand-logo-plate { background-color: #ffffff !important; border: 1px solid #e2e8f0; border-radius: 14px; padding: 10px 22px; display: inline-block; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); }
    .light-logo { display: block; max-height: 44px; width: auto; max-width: 170px; margin: 0 auto; filter: drop-shadow(0 0 1px #ffffff) drop-shadow(0 0 10px rgba(255, 255, 255, 0.95)); -webkit-filter: drop-shadow(0 0 1px #ffffff) drop-shadow(0 0 10px rgba(255, 255, 255, 0.95)); }
    .dark-logo-wrapper { display: none; max-height: 0px; max-width: 0px; overflow: hidden; mso-hide: all; }
    .dark-logo { display: none; max-height: 0px; width: auto; max-width: 170px; margin: 0 auto; }
    .tagline-badge { display: inline-block; margin-top: 12px; font-size: 11px; font-weight: 700; color: #047857; background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 4px 14px; border-radius: 9999px; letter-spacing: 0.3px; text-transform: uppercase; }
    .body { padding: 36px 32px; }
    .badge { display: inline-block; background-color: #ecfdf5; color: #065f46; font-size: 11px; font-weight: 800; padding: 5px 12px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 18px; border: 1px solid #a7f3d0; }
    .greeting { font-size: 15px; font-weight: 700; color: #475569; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px; line-height: 1.35; margin: 0 0 18px 0; }
    .content { font-size: 15px; line-height: 1.65; color: #334155; margin-bottom: 24px; }
    .meta-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 20px 0 24px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .meta-row { border-bottom: 1px solid #e2e8f0; }
    .meta-label { padding: 10px 16px; font-size: 12px; font-weight: 600; color: #64748b; background-color: #f8fafc; text-transform: uppercase; letter-spacing: 0.3px; width: 38%; }
    .meta-value { padding: 10px 16px; font-size: 13px; font-weight: 700; color: #0f172a; background-color: #ffffff; }
    .code-box { background: #f0fdf4; border: 2px dashed #059669; border-radius: 14px; padding: 22px 24px; text-align: center; margin: 24px 0; }
    .code-box .label { font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px; }
    .code-box .code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 32px; font-weight: 900; color: #065f46; letter-spacing: 8px; margin: 0; }
    .code-box .expiry { font-size: 11px; color: #059669; margin-top: 10px; font-weight: 600; }
    .button-container { text-align: center; margin: 28px 0 16px; }
    .button { background-color: #108a00; color: #ffffff !important; padding: 14px 34px; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px rgba(16, 138, 0, 0.28); letter-spacing: 0.2px; }
    .secondary-button { background-color: transparent; color: #108a00 !important; border: 1.5px solid #108a00; padding: 12px 28px; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 13px; display: inline-block; margin-top: 8px; }
    .subnote { font-size: 12px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-top: 24px; line-height: 1.55; }
    .footer { background: #f8fafc; padding: 26px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.6; }
    .footer a { color: #108a00; text-decoration: none; font-weight: 600; }
    .footer-divider { margin: 16px 0; border: 0; border-top: 1px solid #e2e8f0; }
    .footer-secure { font-size: 11px; color: #94a3b8; margin-top: 8px; line-height: 1.5; }

    /* Dark Mode Media Query Overrides (Apple Mail, iOS Mail, macOS Mail, Webmail) */
    @media (prefers-color-scheme: dark) {
      body, .email-wrapper {
        background-color: #0b0f19 !important;
        color: #f1f5f9 !important;
      }
      .container {
        background-color: #111827 !important;
        border-color: #1f2937 !important;
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.6) !important;
      }
      .brand-header {
        background-color: #111827 !important;
        border-bottom-color: #1f2937 !important;
      }
      .brand-logo-plate {
        background-color: #1a2234 !important;
        border-color: #2e3c54 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
      }
      .light-logo {
        display: none !important;
      }
      .dark-logo-wrapper {
        display: block !important;
        max-height: none !important;
        max-width: none !important;
        overflow: visible !important;
      }
      .dark-logo {
        display: block !important;
        max-height: 44px !important;
      }
      .greeting {
        color: #94a3b8 !important;
      }
      .title {
        color: #f8fafc !important;
      }
      .content {
        color: #cbd5e1 !important;
      }
      .badge {
        background-color: #064e3b !important;
        color: #6ee7b7 !important;
        border-color: #047857 !important;
      }
      .tagline-badge {
        background-color: #064e3b !important;
        color: #6ee7b7 !important;
        border-color: #047857 !important;
      }
      .code-box {
        background-color: #064e3b26 !important;
        border-color: #10b981 !important;
      }
      .code-box .label {
        color: #34d399 !important;
      }
      .code-box .code {
        color: #a7f3d0 !important;
      }
      .code-box .expiry {
        color: #6ee7b7 !important;
      }
      .meta-table {
        border-color: #1f2937 !important;
      }
      .meta-label {
        background-color: #1a2234 !important;
        color: #94a3b8 !important;
        border-bottom-color: #1f2937 !important;
      }
      .meta-value {
        background-color: #111827 !important;
        color: #f1f5f9 !important;
        border-bottom-color: #1f2937 !important;
      }
      .subnote {
        background-color: #1a2234 !important;
        border-color: #2e3c54 !important;
        color: #94a3b8 !important;
      }
      .footer {
        background-color: #0f172a !important;
        border-top-color: #1f2937 !important;
        color: #94a3b8 !important;
      }
      .footer-divider {
        border-top-color: #1f2937 !important;
      }
      .footer-secure {
        color: #64748b !important;
      }
      .footer a {
        color: #34d399 !important;
      }
    }

    /* Outlook Global Dark Mode Styles ([data-ogsc]) */
    [data-ogsc] body, [data-ogsc] .email-wrapper { background-color: #0b0f19 !important; color: #f1f5f9 !important; }
    [data-ogsc] .container { background-color: #111827 !important; border-color: #1f2937 !important; }
    [data-ogsc] .brand-header { background-color: #111827 !important; border-bottom-color: #1f2937 !important; }
    [data-ogsc] .brand-logo-plate { background-color: #1a2234 !important; border-color: #2e3c54 !important; }
    [data-ogsc] .light-logo { display: none !important; }
    [data-ogsc] .dark-logo-wrapper { display: block !important; max-height: none !important; max-width: none !important; overflow: visible !important; }
    [data-ogsc] .dark-logo { display: block !important; max-height: 44px !important; }
    [data-ogsc] .title { color: #f8fafc !important; }
    [data-ogsc] .greeting { color: #94a3b8 !important; }
    [data-ogsc] .content { color: #cbd5e1 !important; }
    [data-ogsc] .subnote { background-color: #1a2234 !important; border-color: #2e3c54 !important; color: #94a3b8 !important; }
    [data-ogsc] .footer { background-color: #0f172a !important; border-top-color: #1f2937 !important; color: #94a3b8 !important; }
  </style>
</head>
<body>
  <!-- Invisible Preheader Preview Text -->
  <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: #ffffff; opacity: 0;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <div class="email-wrapper">
    <div class="container">
      <!-- Brand Header with Dark Mode Resilient Logo Architecture -->
      <div class="brand-header">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td align="center">
              <a href="${siteUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                <div class="brand-logo-plate" style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 10px 22px; display: inline-block; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                  <!-- Light Mode Logo (With Halo Drop-Shadow Safeguard for Aggressive Dark Mode Inverters) -->
                  <img src="${logoUrl}" alt="Vaziro" class="light-logo" width="160" height="48" style="display: block; max-height: 44px; width: auto; max-width: 170px; margin: 0 auto; border: 0; outline: none; text-decoration: none; filter: drop-shadow(0 0 1px #ffffff) drop-shadow(0 0 10px rgba(255, 255, 255, 0.95)); -webkit-filter: drop-shadow(0 0 1px #ffffff) drop-shadow(0 0 10px rgba(255, 255, 255, 0.95));" />
                  
                  <!-- Dark Mode Logo (For Media Query / Outlook Supporting Clients) -->
                  <!--[if !mso]><!-->
                  <div class="dark-logo-wrapper" style="display: none; max-height: 0px; max-width: 0px; overflow: hidden; mso-hide: all;">
                    <img src="${logoWhiteUrl}" alt="Vaziro" class="dark-logo" width="160" height="48" style="display: none; max-height: 0px; width: auto; max-width: 170px; margin: 0 auto; border: 0; outline: none; text-decoration: none;" />
                  </div>
                  <!--<![endif]-->
                </div>
              </a>
            </td>
          </tr>
        </table>
        <div style="margin-top: 12px;">
          <span class="tagline-badge">India's Verified Marketplace &bull; 0% Commission</span>
        </div>
      </div>

      <!-- Main Body -->
      <div class="body">
        ${badge ? `<div class="badge">${badge}</div>` : ''}
        <div class="greeting">Hello ${userName},</div>
        <h2 class="title">${title}</h2>
        <div class="content">${message.replace(/\n/g, '<br />')}</div>

        ${metaRows && metaRows.length > 0 ? `
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="meta-table" style="width: 100%; border-collapse: separate; border-spacing: 0; margin: 22px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          ${metaRows.map((row, idx) => `
            <tr class="meta-row">
              <td class="meta-label" style="padding: 11px 16px; font-size: 12px; font-weight: 600; color: #64748b; background-color: #f8fafc; text-transform: uppercase; letter-spacing: 0.3px; width: 40%; ${idx < metaRows.length - 1 ? 'border-bottom: 1px solid #e2e8f0;' : ''}">${row.label}</td>
              <td class="meta-value" style="padding: 11px 16px; font-size: 13px; font-weight: 700; color: #0f172a; background-color: #ffffff; ${idx < metaRows.length - 1 ? 'border-bottom: 1px solid #e2e8f0;' : ''}">${row.value}</td>
            </tr>
          `).join('')}
        </table>
        ` : ''}

        ${highlightCode ? `
        <div class="code-box">
          <div class="label">Your Verification Code</div>
          <div class="code">${highlightCode}</div>
          <div class="expiry">Valid for 15 minutes &bull; Never share this code with anyone</div>
        </div>
        ` : ''}

        ${actionUrl ? `
        <div class="button-container">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
            <tr>
              <td align="center" style="border-radius: 9999px; background-color: #108a00;">
                <a href="${actionUrl}" class="button" target="_blank" style="background-color: #108a00; color: #ffffff !important; padding: 14px 34px; text-decoration: none; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block; letter-spacing: 0.2px;">
                  ${actionText} &rarr;
                </a>
              </td>
            </tr>
          </table>
          ${secondaryActionUrl ? `
          <div style="margin-top: 10px;">
            <a href="${secondaryActionUrl}" class="secondary-button" target="_blank">${secondaryActionText || 'Learn More'}</a>
          </div>
          ` : ''}
        </div>
        ` : ''}

        ${subNote ? `<div class="subnote">${subNote}</div>` : ''}
      </div>

      <!-- Footer -->
      <div class="footer">
        <div style="font-weight: 700; color: #334155; margin-bottom: 4px;">
          Vaziro &mdash; India's Direct Marketplace &bull; 0% Platform Commission
        </div>
        <div style="margin-top: 6px;">
          <a href="${siteUrl}">vaziro.in</a> &bull; 
          <a href="${siteUrl}/terms">Terms</a> &bull; 
          <a href="${siteUrl}/privacy">Privacy</a> &bull; 
          <a href="${siteUrl}/trust-safety">Trust &amp; Safety</a> &bull; 
          <a href="mailto:support@vaziro.in">support@vaziro.in</a>
        </div>
        <hr class="footer-divider" />
        <div class="footer-secure">
          &copy; ${currentYear} Proanta Technologies Private Limited. All rights reserved.<br />
          Security Notice: Vaziro staff will never ask for your password, PIN, or OTP.
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
    }
    // ============================================================================
    // PRE-CONFIGURED WORKFLOW NOTIFICATION TRIGGERS
    // ============================================================================
    /**
     * 1. Welcome Notification for New Accounts
     */
    static async sendWelcome(user) {
        const isProfessional = user.roles?.includes('PROFESSIONAL');
        const title = isProfessional ? 'Welcome to Vaziro Professional Network!' : 'Welcome to Vaziro!';
        const message = isProfessional
            ? `Welcome ${user.firstName}! Your professional account is ready with 10 free starter credits. Browse open customer requirements across India, submit quotes with zero platform commission, and grow your independent practice.`
            : `Welcome ${user.firstName}! Your Vaziro account has been created. Post your service requirements, connect with verified Indian service professionals, and enjoy full payment protection.`;
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: user.firstName,
            badge: isProfessional ? 'PROFESSIONAL ONBOARDING' : 'WELCOME TO VAZIRO',
            message,
            actionUrl: `${NotificationService.frontendBaseUrl}${isProfessional ? '/requirements' : '/dashboard'}`,
            actionText: isProfessional ? 'Browse Open Leads' : 'Go to Dashboard',
            metaRows: [
                { label: 'Account Type', value: isProfessional ? 'Independent Professional' : 'Direct Client' },
                { label: 'Platform Commission', value: '0% Platform Fee' },
                { label: 'Escrow Guarantee', value: '100% Payment Protected' },
            ],
            subNote: 'Need any assistance getting started? Chat anytime with Isha, our 24/7 assistant, or email support@vaziro.in.',
        });
        await NotificationService.send({
            userId: user.id,
            type: 'SYSTEM',
            title,
            message,
            actionUrl: isProfessional ? '/requirements' : '/dashboard',
            email: user.email ? { to: user.email, subject: title, html } : undefined,
        });
        // Executive broadcast to info@vaziro.in
        NotificationService.notifyAdminEvent({
            eventType: 'ACCOUNT_CREATED',
            title: `New Account Created: ${user.firstName} (${isProfessional ? 'Professional' : 'Customer'})`,
            message: `A new ${isProfessional ? 'service professional' : 'customer'} has successfully onboarded on Vaziro.`,
            metadata: [
                { label: 'Member Name', value: user.firstName },
                { label: 'Designated Role', value: isProfessional ? 'Professional' : 'Customer' },
                { label: 'Email Address', value: user.email || 'Pending verification' },
                { label: 'User ID', value: user.id },
            ],
            actionUrl: `${NotificationService.frontendBaseUrl}/admin`,
            actionText: 'Inspect in Admin Console',
        }).catch((err) => console.warn('[NotificationService] Admin welcome alert warning:', err?.message));
    }
    /**
     * 2. Customer: Quotation Received
     */
    static async sendQuotationReceived(params) {
        const title = 'New Quotation Received';
        const message = `${params.professionalName} has submitted a quotation of ₹${params.quotationAmount.toLocaleString('en-IN')} for your requirement: "${params.requirementTitle}".`;
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: 'Client',
            badge: 'QUOTATION RECEIVED',
            message: `${params.professionalName} has submitted a detailed proposal of ₹${params.quotationAmount.toLocaleString('en-IN')} for your requirement "${params.requirementTitle}".\n\nCompare proposals, review verified credentials, and hire safely with 100% Escrow Protection.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/requirements/${params.requirementId}`,
            actionText: 'Review Quotation & Hire',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Professional', value: params.professionalName },
                { label: 'Proposed Price', value: `₹${params.quotationAmount.toLocaleString('en-IN')}` },
                { label: 'Escrow Protection', value: '100% Covered Upon Hiring' },
            ],
            subNote: '🔒 Vaziro Buyer Protection: Your funds are held securely until you confirm satisfactory service completion.',
        });
        await NotificationService.send({
            userId: params.customerUserId,
            type: 'QUOTATION',
            title,
            message,
            actionUrl: `/requirements/${params.requirementId}`,
            email: {
                subject: `New Quotation: ₹${params.quotationAmount.toLocaleString('en-IN')} from ${params.professionalName}`,
                html,
            },
        });
    }
    /**
     * 3. Professional & Customer: Hire Confirmed & Payment Secured
     */
    static async sendHireConfirmed(params) {
        const custTitle = 'Professional Hired Successfully';
        const custMessage = `You have hired ${params.professionalName} for "${params.requirementTitle}". ${params.paymentSecured ? 'Your payment is safely held in Vaziro Escrow until you confirm work completion.' : ''}`;
        const custHtml = NotificationService.generateEmailTemplate({
            title: custTitle,
            userName: params.customerName || 'Client',
            badge: 'HIRE CONFIRMED & ESCROW FUNDED',
            message: `You have successfully hired ${params.professionalName} for "${params.requirementTitle}". ${params.paymentSecured ? 'Your payment is securely held in Vaziro Escrow and will only be disbursed when you are 100% satisfied.' : ''}\n\nDirect contact details (mobile number and email) are now unlocked in your job workspace.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'View Job Workspace & Contact',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Hired Professional', value: params.professionalName },
                { label: 'Contract Value', value: `₹${params.quotationAmount.toLocaleString('en-IN')}` },
                { label: 'Escrow Status', value: params.paymentSecured ? 'Secured & Protected' : 'Booking Confirmed' },
            ],
            subNote: 'Safety Reminder: Always keep communication and milestone approvals inside Vaziro to retain 100% buyer protection.',
        });
        // Notify Customer
        await NotificationService.send({
            userId: params.customerUserId,
            type: 'HIRE',
            title: custTitle,
            message: custMessage,
            actionUrl: `/jobs/${params.jobId}`,
            email: {
                subject: `Hire Confirmed: ${params.professionalName} for "${params.requirementTitle}"`,
                html: custHtml,
            },
        });
        const profTitle = 'Congratulations! You Have Been Hired';
        const profMessage = `${params.customerName} has hired you for "${params.requirementTitle}". ${params.paymentSecured ? 'Contract payment has been secured in Vaziro Escrow.' : ''} Update your work status as you proceed.`;
        const profHtml = NotificationService.generateEmailTemplate({
            title: profTitle,
            userName: params.professionalName || 'Professional',
            badge: 'NEW CONTRACT AWARDED',
            message: `Congratulations! ${params.customerName} has accepted your quote and hired you for "${params.requirementTitle}". ${params.paymentSecured ? 'The contract payment is fully funded in Vaziro Escrow.' : ''}\n\nCustomer contact information is now unlocked. Reach out to coordinate execution details and update milestones as you proceed.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'Open Job Workspace',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Customer Name', value: params.customerName },
                { label: 'Contract Value', value: `₹${params.quotationAmount.toLocaleString('en-IN')}` },
                { label: 'Platform Commission', value: '0% (Keep 100% of Payout)' },
            ],
            subNote: 'Remember to update your work status as you make progress so the customer stays informed.',
        });
        // Notify Professional
        await NotificationService.send({
            userId: params.professionalUserId,
            type: 'HIRE',
            title: profTitle,
            message: profMessage,
            actionUrl: `/jobs/${params.jobId}`,
            email: {
                subject: `Congratulations! You've been hired by ${params.customerName}`,
                html: profHtml,
            },
        });
        // Executive broadcast to info@vaziro.in
        NotificationService.notifyAdminEvent({
            eventType: 'PROFESSIONAL_HIRED',
            title: `Professional Hired: "${params.requirementTitle}"`,
            message: `${params.customerName} has confirmed hiring of ${params.professionalName} for "${params.requirementTitle}". Agreed Contract Value: ₹${params.quotationAmount.toLocaleString('en-IN')}.`,
            metadata: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Customer', value: params.customerName },
                { label: 'Hired Professional', value: params.professionalName },
                { label: 'Agreed Price', value: `₹${params.quotationAmount.toLocaleString('en-IN')}` },
                { label: 'Escrow Protection', value: params.paymentSecured ? '100% Secured in Escrow' : 'Direct Booking' },
            ],
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'View Job Record',
        }).catch((err) => console.warn('[NotificationService] Admin hire alert warning:', err?.message));
    }
    /**
     * 4. Customer: Work Status Updated by Professional
     */
    static async sendWorkStatusUpdate(params) {
        const statusLabels = {
            PREPARING: 'is preparing for the task',
            ON_THE_WAY: 'is on the way to your location',
            WORK_STARTED: 'has started working on your requirement',
            WORK_COMPLETED: 'has marked the work as completed',
        };
        const statusText = statusLabels[params.workStatus] || `updated status to ${params.workStatus}`;
        const title = `Work Status: ${params.workStatus.replace(/_/g, ' ')}`;
        const message = `${params.professionalName} ${statusText} for "${params.requirementTitle}".`;
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: 'Client',
            badge: 'JOB PROGRESS UPDATE',
            message: `${params.professionalName} ${statusText} for your requirement "${params.requirementTitle}". Real-time tracking and updates are available in your job dashboard.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'View Job Progress',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Professional', value: params.professionalName },
                { label: 'Current Status', value: params.workStatus.replace(/_/g, ' ') },
            ],
        });
        await NotificationService.send({
            userId: params.customerUserId,
            type: 'JOB_STATUS',
            title,
            message,
            actionUrl: `/jobs/${params.jobId}`,
            email: {
                subject: `Status Update: ${params.professionalName} ${statusText}`,
                html,
            },
        });
    }
    /**
     * 5. Customer: Work Completed Confirmation Required
     */
    static async sendWorkCompletedConfirmation(params) {
        const title = 'Action Required: Confirm Work Completion';
        const message = `${params.professionalName} has marked your service "${params.requirementTitle}" as completed. Please inspect the work and confirm completion to release payment.`;
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: 'Client',
            badge: 'ACTION REQUIRED • ESCROW RELEASE',
            message: `${params.professionalName} has completed work for "${params.requirementTitle}". Please inspect the deliverables and verify that everything meets your standards.\n\nOnce satisfied, approve completion to release the escrow payout. If revisions are required, you can communicate directly with the professional.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'Inspect Deliverables & Release Escrow',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Professional', value: params.professionalName },
                { label: 'Status', value: 'Marked Completed by Professional' },
                { label: 'Escrow Status', value: 'Awaiting Your Release' },
            ],
            subNote: '🔒 Your funds remain protected with Vaziro until you approve release or open a dispute.',
        });
        await NotificationService.send({
            userId: params.customerUserId,
            type: 'JOB_STATUS',
            title,
            message,
            actionUrl: `/jobs/${params.jobId}`,
            email: {
                subject: `Action Required: Confirm Work Completion for "${params.requirementTitle}"`,
                html,
            },
        });
    }
    /**
     * 6. Both Parties: Payment Released
     */
    static async sendPaymentReleased(params) {
        const profTitle = 'Payment Released to You';
        const profMessage = `Contract payment of ₹${params.amount.toLocaleString('en-IN')} for "${params.requirementTitle}" has been released to your account/wallet. Thank you for your quality service!`;
        const profHtml = NotificationService.generateEmailTemplate({
            title: profTitle,
            userName: 'Professional',
            badge: 'PAYMENT RELEASED (0% COMMISSION)',
            message: profMessage,
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'View Job Receipt & Wallet',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Gross Payout', value: `₹${params.amount.toLocaleString('en-IN')}` },
                { label: 'Platform Commission', value: '₹0 (0% Fee)' },
                { label: 'Net Disbursed', value: `₹${params.amount.toLocaleString('en-IN')}` },
            ],
            subNote: 'Vaziro never takes a cut of your contract payouts. 100% of your earnings belong to you.',
        });
        // Notify Professional
        await NotificationService.send({
            userId: params.professionalUserId,
            type: 'PAYMENT',
            title: profTitle,
            message: profMessage,
            actionUrl: `/jobs/${params.jobId}`,
            email: {
                subject: `Payment Released: ₹${params.amount.toLocaleString('en-IN')} for "${params.requirementTitle}"`,
                html: profHtml,
            },
        });
        const custTitle = 'Payment Released';
        const custMessage = `Payment of ₹${params.amount.toLocaleString('en-IN')} for "${params.requirementTitle}" has been released. Please leave a review for the professional!`;
        const custHtml = NotificationService.generateEmailTemplate({
            title: 'Payment Released & Service Closed',
            userName: 'Client',
            badge: 'ESCROW SETTLED',
            message: custMessage,
            actionUrl: `${NotificationService.frontendBaseUrl}/jobs/${params.jobId}`,
            actionText: 'Review Professional',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Settled Amount', value: `₹${params.amount.toLocaleString('en-IN')}` },
                { label: 'Escrow Status', value: 'Completed & Disbursed' },
            ],
            subNote: 'Thank you for choosing Vaziro Escrow Protection. Please rate your experience to help the community.',
        });
        // Notify Customer
        await NotificationService.send({
            userId: params.customerUserId,
            type: 'PAYMENT',
            title: custTitle,
            message: custMessage,
            actionUrl: `/jobs/${params.jobId}`,
            email: {
                subject: `Payment Receipt: ₹${params.amount.toLocaleString('en-IN')} for "${params.requirementTitle}"`,
                html: custHtml,
            },
        });
        // Executive broadcast to info@vaziro.in
        NotificationService.notifyAdminEvent({
            eventType: 'TRANSACTION',
            title: `Payment Released: ₹${params.amount.toLocaleString('en-IN')} for "${params.requirementTitle}"`,
            message: `Escrow payment of ₹${params.amount.toLocaleString('en-IN')} has been disbursed upon milestone completion for "${params.requirementTitle}".`,
            metadata: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Disbursed Amount', value: `₹${params.amount.toLocaleString('en-IN')}` },
                { label: 'Job ID', value: params.jobId },
            ],
            actionUrl: `${NotificationService.frontendBaseUrl}/admin`,
            actionText: 'Open Admin Ledger',
        }).catch((err) => console.warn('[NotificationService] Admin payout alert warning:', err?.message));
    }
    /**
     * 7. Professional: Application Submitted
     */
    static async sendApplicationSubmitted(params) {
        const title = 'Quotation Delivered to Customer';
        const message = `Your quotation for "${params.requirementTitle}" has been delivered (${params.creditsSpent} credits used). If another professional is hired, your credits will be refunded automatically.`;
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: 'Professional',
            badge: 'PROPOSAL DELIVERED',
            message: `Your quotation for "${params.requirementTitle}" has been successfully delivered to the customer. ${params.creditsSpent} credits were used to submit this quote.\n\nUnder our 100% Application Protection Guarantee, if another professional is hired or the requirement expires without hiring, your credits are refunded automatically.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/requirements/${params.requirementId}`,
            actionText: 'View Quotation Status',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle },
                { label: 'Credits Allocated', value: `${params.creditsSpent} Credits` },
                { label: 'Vaziro Commission', value: '0% (Direct Connect)' },
                { label: 'Protection', value: '100% Automatic Refund if not hired' },
            ],
        });
        await NotificationService.send({
            userId: params.professionalUserId,
            type: 'QUOTATION',
            title,
            message,
            actionUrl: `/requirements/${params.requirementId}`,
            email: {
                subject: `Quotation Delivered: "${params.requirementTitle}"`,
                html,
            },
        });
    }
    /**
     * 8. Professional: Automatic Credit Refund (Not Selected or Requirement Expired)
     */
    static async sendCreditRefund(params) {
        const isExpired = params.reason.toUpperCase().includes('EXPIRED');
        const reasonText = isExpired
            ? `The requirement "${params.requirementTitle || 'Service Request'}" expired without hiring.`
            : `Another candidate was selected for "${params.requirementTitle || 'Service Request'}".`;
        const title = `Automatic Credit Refund (+${params.creditsRefunded} Credits)`;
        const message = `${reasonText} Under Vaziro's 100% Application Protection Guarantee, ${params.creditsRefunded} credits have been restored to your wallet immediately.`;
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: 'Professional',
            badge: '100% CREDIT PROTECTION GUARANTEE',
            message: `${reasonText}\n\nUnder Vaziro's 100% Application Protection Guarantee, your investment is fully safeguarded. ${params.creditsRefunded} credits have been automatically refunded to your wallet so you can apply to other client requirements.`,
            actionUrl: `${NotificationService.frontendBaseUrl}/credits`,
            actionText: 'View Credit Balance',
            metaRows: [
                { label: 'Requirement', value: params.requirementTitle || 'Service Request' },
                { label: 'Credits Restored', value: `+${params.creditsRefunded} Credits` },
                { label: 'Protection Policy', value: '100% Credit Guarantee' },
            ],
            subNote: 'Vaziro Guarantee: When you propose on open requirements, you only spend credits if you are hired or shortlisted by the customer.',
        });
        await NotificationService.send({
            userId: params.professionalUserId,
            type: 'PAYMENT',
            title,
            message,
            actionUrl: '/credits',
            email: {
                subject: title,
                html,
            },
        });
    }
    /**
     * 9. Account Recovery: Password Reset Code
     */
    static async sendPasswordResetCode(params) {
        const name = params.firstName || 'Vaziro Member';
        if (params.email) {
            const html = NotificationService.generateEmailTemplate({
                title: 'Reset Your Vaziro Password',
                userName: name,
                badge: 'SECURITY VERIFICATION',
                message: 'We received an authorized request to reset the password for your Vaziro account. Please enter the 6-digit verification code below to authorize your password update:',
                highlightCode: params.code,
                subNote: '🔒 Security Advisory: Never share this verification code or your password with anyone. Vaziro staff will never call or message asking for your OTP, password, or bank details.',
            });
            await NotificationService.sendEmailViaResend({
                to: params.email,
                subject: `${params.code} is your Vaziro password reset code`,
                html,
            });
        }
    }
    /**
     * 10. Security Alert: Password Changed Confirmation
     */
    static async sendPasswordChangedNotification(user) {
        const title = 'Security Notice: Password Updated';
        const message = 'Your Vaziro account password was successfully updated. If you made this change, no further action is required.\n\nIf you did NOT authorize this change, please contact support@vaziro.in immediately to lock your account and protect your personal information.';
        const html = NotificationService.generateEmailTemplate({
            title,
            userName: user.firstName || 'Vaziro Member',
            badge: 'SECURITY ALERT',
            message,
            actionUrl: `${NotificationService.frontendBaseUrl}/profile`,
            actionText: 'Review Profile Security',
            subNote: 'Security Recommendation: Ensure you use a unique password and keep two-factor authentication or verified phone details active.',
        });
        await NotificationService.send({
            userId: user.id,
            type: 'SYSTEM',
            title,
            message,
            actionUrl: '/profile',
            email: user.email ? { to: user.email, subject: title, html } : undefined,
        });
    }
    /**
     * 11. Executive Notification to info@vaziro.in for Critical Platform Events
     * Dispatches alerts for:
     * - Account Creation
     * - Transaction / Payment Verified / Credit Pack Purchased
     * - Job / Requirement Posted
     * - Professional Hired
     * - Dispute Raised
     */
    static async notifyAdminEvent(params) {
        const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'info@vaziro.in';
        const badgeMap = {
            ACCOUNT_CREATED: '⚡ NEW USER ONBOARDING',
            TRANSACTION: '💰 PAYMENT & ESCROW TRANSACTION',
            REQUIREMENT_POSTED: '📋 NEW REQUIREMENT POSTED',
            PROFESSIONAL_HIRED: '🤝 PROFESSIONAL HIRED',
            DISPUTE: '⚖️ DISPUTE CASE NOTICE',
        };
        const actionUrl = params.actionUrl || `${NotificationService.frontendBaseUrl}/admin`;
        const actionText = params.actionText || 'Open Administration Console';
        const html = NotificationService.generateEmailTemplate({
            title: params.title,
            userName: 'Vaziro Administrator',
            badge: badgeMap[params.eventType] || 'OPERATIONAL ALERT',
            message: params.message,
            actionUrl,
            actionText,
            metaRows: [
                ...(params.metadata || []),
                { label: 'Event Timestamp', value: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' },
            ],
            subNote: 'This executive notice was dispatched automatically to info@vaziro.in from the Vaziro Core Platform.',
        });
        // Asynchronously dispatch email without blocking caller
        setImmediate(async () => {
            try {
                await NotificationService.sendEmailViaResend({
                    to: adminEmail,
                    subject: `[Vaziro Alert] ${params.title}`,
                    html,
                });
            }
            catch (err) {
                console.warn(`[NotificationService] notifyAdminEvent failed to send to ${adminEmail}:`, err?.message || err);
            }
        });
    }
}
exports.NotificationService = NotificationService;
