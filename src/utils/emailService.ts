import nodemailer from 'nodemailer';
import { logger } from './logger';
import { environment } from '../config/environment';

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const emailConfig = environment.get().email;

    if (!emailConfig.host || !emailConfig.port || !emailConfig.user || !emailConfig.pass) {
      logger.warn('Email configuration incomplete. Email service will not be available.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure, // true for 465, false for other ports
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully', {
        host: emailConfig.host,
        port: emailConfig.port,
        from: emailConfig.from,
      });
    } catch (error: any) {
      logger.error('Failed to initialize email service', {
        error: error.message,
      });
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.error('Email service not configured. Cannot send email.', {
        to: options.to,
        subject: options.subject,
      });
      return false;
    }

    const emailConfig = environment.get().email;

    try {
      const mailOptions = {
        from: `"${emailConfig.fromName}" <${emailConfig.from}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send OTP email
   */
  async sendOTPEmail(email: string, otp: string, name: string): Promise<boolean> {
    const subject = 'Your Codex Login OTP';
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Codex Login OTP</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f4f4f4;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              padding: 30px;
              text-align: center;
              color: white;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 600;
            }
            .content {
              padding: 40px 30px;
            }
            .otp-box {
              background: #f8f9fa;
              border: 2px dashed #667eea;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 30px 0;
            }
            .otp-code {
              font-size: 36px;
              font-weight: bold;
              color: #667eea;
              letter-spacing: 8px;
              margin: 10px 0;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .warning p {
              margin: 0;
              color: #856404;
            }
            .footer {
              background: #f8f9fa;
              padding: 20px 30px;
              text-align: center;
              color: #6c757d;
              font-size: 14px;
            }
            .footer p {
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Codex Login Verification</h1>
            </div>
            <div class="content">
              <p>Hello <strong>${name}</strong>,</p>
              <p>You requested to log in to your Codex account. Please use the following One-Time Password (OTP) to complete your login:</p>
              
              <div class="otp-box">
                <p style="margin: 0; font-size: 14px; color: #6c757d;">Your OTP Code</p>
                <div class="otp-code">${otp}</div>
                <p style="margin: 0; font-size: 14px; color: #6c757d;">Valid for 10 minutes</p>
              </div>

              <div class="warning">
                <p><strong>⚠️ Security Notice:</strong> This OTP is valid for <strong>10 minutes</strong>. Do not share this code with anyone. If you didn't request this, please ignore this email.</p>
              </div>

              <p>If you have any questions or need assistance, please contact your system administrator.</p>
              
              <p style="margin-top: 30px;">Best regards,<br><strong>Codex Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; ${new Date().getFullYear()} Codex. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hello ${name},

You requested to log in to your Codex account. Please use the following One-Time Password (OTP) to complete your login:

OTP Code: ${otp}

This OTP is valid for 10 minutes.

Security Notice: Do not share this code with anyone. If you didn't request this, please ignore this email.

If you have any questions or need assistance, please contact your system administrator.

Best regards,
Codex Team

---
This is an automated email. Please do not reply to this message.
© ${new Date().getFullYear()} Codex. All rights reserved.
    `.trim();

    return await this.sendEmail({
      to: email,
      subject,
      text,
      html,
    });
  }

  /**
   * Check if email service is configured
   */
  isAvailable(): boolean {
    return this.isConfigured;
  }
}

// Export singleton instance
export const emailService = new EmailService();

