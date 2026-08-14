import { Resend } from 'resend';
import { logger } from '../utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM = 'BlofinPro <noreply@blofinpro.com>';
const DEV_MODE = !process.env.RESEND_API_KEY;

async function send(to: string, subject: string, html: string): Promise<void> {
  if (DEV_MODE) {
    logger.warn(`[EMAIL SKIPPED - no RESEND_API_KEY] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to: [to], subject, html });
    if (error) logger.error('Resend error:', error);
    else logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error('Email send failed:', err);
  }
}

export class EmailService {
  static async sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
    await send(
      to,
      'Password Reset Request',
      `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;border-radius:8px;">
        <h2 style="color:#f59e0b;">Password Reset</h2>
        <p>You requested a password reset for your BlofinPro account.</p>
        <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#f59e0b;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;margin:16px 0;">Reset Password</a>
        <p style="font-size:12px;color:#666;">If you didn't request this, ignore this email. Link expires in 1 hour.</p>
      </div>`
    );
  }

  static async sendDepositStatusEmail(
    to: string,
    status: 'APPROVED' | 'REJECTED',
    amount: string,
    coin: string,
    reason?: string
  ): Promise<void> {
    const isApproved = status === 'APPROVED';
    const color = isApproved ? '#10b981' : '#ef4444';
    const title = isApproved ? '✅ Deposit Approved' : '❌ Deposit Rejected';
    const message = isApproved
      ? `Your deposit of <strong>${amount} ${coin}</strong> has been approved and credited to your wallet.`
      : `Your deposit of <strong>${amount} ${coin}</strong> has been rejected.${reason ? `<br/><strong>Reason:</strong> ${reason}` : ''}`;

    await send(
      to,
      title,
      `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;border-radius:8px;">
        <h2 style="color:${color};">${title}</h2>
        <p>${message}</p>
        <p>Log in to your <a href="http://localhost:5173/dashboard" style="color:#f59e0b;">BlofinPro dashboard</a> to view details.</p>
      </div>`
    );
  }

  static async sendWithdrawalStatusEmail(
    to: string,
    status: 'APPROVED' | 'REJECTED',
    amount: string,
    coin: string,
    toAddress: string,
    reason?: string
  ): Promise<void> {
    const isApproved = status === 'APPROVED';
    const color = isApproved ? '#10b981' : '#ef4444';
    const title = isApproved ? '✅ Withdrawal Completed' : '❌ Withdrawal Rejected';
    const message = isApproved
      ? `Your withdrawal of <strong>${amount} ${coin}</strong> to <code>${toAddress}</code> has been processed.`
      : `Your withdrawal of <strong>${amount} ${coin}</strong> has been rejected and the amount has been refunded to your wallet.${reason ? `<br/><strong>Reason:</strong> ${reason}` : ''}`;

    await send(
      to,
      title,
      `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;border-radius:8px;">
        <h2 style="color:${color};">${title}</h2>
        <p>${message}</p>
        <p>Log in to your <a href="http://localhost:5173/dashboard" style="color:#f59e0b;">BlofinPro dashboard</a> to view details.</p>
      </div>`
    );
  }

  static async sendKycStatusEmail(
    to: string,
    status: 'APPROVED' | 'REJECTED',
    docType: string,
    reason?: string
  ): Promise<void> {
    const isApproved = status === 'APPROVED';
    const color = isApproved ? '#10b981' : '#ef4444';
    const title = isApproved ? '✅ KYC Document Approved' : '❌ KYC Document Rejected';
    const readableDoc = docType.replace(/_/g, ' ');
    const message = isApproved
      ? `Your <strong>${readableDoc}</strong> has been verified. Your account KYC status has been updated.`
      : `Your <strong>${readableDoc}</strong> was rejected.${reason ? `<br/><strong>Reason:</strong> ${reason}` : ''} Please re-submit a valid document.`;

    await send(
      to,
      title,
      `<div style="font-family:sans-serif;padding:24px;background:#0f0f0f;color:#fff;border-radius:8px;">
        <h2 style="color:${color};">${title}</h2>
        <p>${message}</p>
        <p>Log in to your <a href="http://localhost:5173/settings" style="color:#f59e0b;">BlofinPro account settings</a> to manage your verification.</p>
      </div>`
    );
  }
}
