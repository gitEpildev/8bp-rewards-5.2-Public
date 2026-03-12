import nodemailer from 'nodemailer';
import { logger } from './LoggerService';

export class EmailNotificationService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Ensure dotenv is loaded
    if (typeof require !== 'undefined') {
      try {
        require('dotenv').config();
      } catch (e) {
        // dotenv already loaded
      }
    }
    
    // Port 587 uses STARTTLS (secure: false), port 465 uses SSL (secure: true)
    const port = parseInt(process.env.SMTP_PORT || '587');
    const secure = port === 465 || process.env.SMTP_SECURE === 'true';
    
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: secure, // false for 587 (STARTTLS), true for 465 (SSL)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        // Do not fail on invalid certificates (for testing)
        rejectUnauthorized: false
      }
    });
    
    if (!this.isConfigured()) {
      logger.warn('EmailNotificationService: SMTP not fully configured', {
        hasHost: !!process.env.SMTP_HOST,
        hasUser: !!process.env.SMTP_USER,
        hasPass: !!process.env.SMTP_PASS,
        hasFrom: !!process.env.MAIL_FROM
      });
    }
  }

  /**
   * Send a 6-digit PIN code via email
   * @param email - Recipient email address
   * @param pin - 6-digit PIN code
   * @param purpose - Purpose of the PIN (e.g., "VPS Monitor Access", "Leaderboard Reset")
   * @returns Promise<boolean> - true if sent successfully
   */
  async sendPinCode(email: string, pin: string, purpose: string = 'Authentication'): Promise<boolean> {
    try {
      const mailOptions = {
        from: process.env.MAIL_FROM,
        to: email,
        subject: `8BP Rewards - ${purpose} Code`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Authentication Code</h1>
            </div>
            
            <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0; font-size: 20px;">${purpose}</h2>
              
              <p style="color: #555; line-height: 1.6; font-size: 16px;">
                Your verification code is:
              </p>
              
              <div style="background-color: #f7f9fc; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
                <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
                  ${pin}
                </div>
              </div>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  ⚠️ <strong>Security Notice:</strong> This code expires in 5 minutes. Do not share this code with anyone.
                </p>
              </div>
              
              <p style="color: #777; font-size: 14px; margin-top: 25px; line-height: 1.6;">
                If you didn't request this code, please ignore this email and contact support if you have concerns.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
              
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                <strong>8 Ball Pool Rewards System</strong><br>
                This is an automated message, please do not reply.
              </p>
            </div>
          </div>
        `,
        text: `
          ${purpose}
          
          Your verification code is: ${pin}
          
          ⚠️ Security Notice: This code expires in 5 minutes. Do not share this code with anyone.
          
          If you didn't request this code, please ignore this email and contact support if you have concerns.
          
          ---
          8 Ball Pool Rewards System
          This is an automated message, please do not reply.
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('PIN code email sent successfully', {
        action: 'pin_code_email_sent',
        email,
        purpose,
        messageId: info.messageId,
        response: info.response
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to send PIN code email', {
        action: 'pin_code_email_error',
        email,
        purpose,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: error?.code,
        errorCommand: error?.command,
        errorResponse: error?.response,
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  async sendDeregistrationConfirmation(email: string, requestNumber: string): Promise<boolean> {
    return this.sendDeregistrationEmail(
      email,
      'Deregistration request received',
      requestNumber,
      'Your request has been received and is now pending review by the admin team. You will receive another email once the request has been approved or denied.',
      '#667eea'
    );
  }

  async sendDeregistrationApproved(email: string, requestNumber: string): Promise<boolean> {
    return this.sendDeregistrationEmail(
      email,
      'Deregistration completed',
      requestNumber,
      'Your deregistration request has been approved. Your ID has now been removed from the system. Thank you.',
      '#22c55e'
    );
  }

  async sendDeregistrationDenied(email: string, requestNumber: string): Promise<boolean> {
    return this.sendDeregistrationEmail(
      email,
      'Deregistration request update',
      requestNumber,
      'Your deregistration request has been reviewed and was not approved. If you believe this was an error, please contact support.',
      '#ef4444'
    );
  }

  private async sendDeregistrationEmail(
    email: string,
    subject: string,
    requestNumber: string,
    bodyText: string,
    accentColor: string
  ): Promise<boolean> {
    try {
      const mailOptions = {
        from: process.env.MAIL_FROM,
        to: email,
        subject: `8BP Rewards - ${subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, ${accentColor} 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Deregistration Request</h1>
            </div>
            <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0; font-size: 20px;">${subject}</h2>
              <div style="background-color: #f7f9fc; border: 2px dashed ${accentColor}; border-radius: 8px; padding: 20px; text-align: center; margin: 25px 0;">
                <div style="font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px;">Request Number</div>
                <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: ${accentColor}; font-family: 'Courier New', monospace;">
                  ${requestNumber}
                </div>
              </div>
              <p style="color: #555; line-height: 1.6; font-size: 16px;">
                ${bodyText}
              </p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 25px 0;">
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                <strong>8 Ball Pool Rewards System</strong><br>
                This is an automated message, please do not reply.
              </p>
            </div>
          </div>
        `,
        text: `${subject}\n\nRequest Number: ${requestNumber}\n\n${bodyText}\n\n---\n8 Ball Pool Rewards System\nThis is an automated message, please do not reply.`
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Deregistration email sent', {
        action: 'deregistration_email_sent',
        email,
        requestNumber,
        subject,
        messageId: info.messageId
      });
      return true;
    } catch (error: any) {
      logger.error('Failed to send deregistration email', {
        action: 'deregistration_email_error',
        email,
        requestNumber,
        subject,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Verify if email service is configured
   * @returns boolean - true if SMTP is configured
   */
  isConfigured(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.MAIL_FROM
    );
  }
}

