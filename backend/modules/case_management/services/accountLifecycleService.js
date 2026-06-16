const crypto = require('crypto');
const { pool } = require('../../shared/database/database');

const PUBLIC_EMAIL_DOMAINS = (
  process.env.PUBLIC_EMAIL_DOMAINS ||
  'gmail.com,yahoo.com,outlook.com,hotmail.com,live.com,icloud.com,aol.com,protonmail.com,zoho.com'
)
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

const VERIFICATION_TTL_MINUTES = Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES || 60 * 24);
const RESEND_MIN_SECONDS = Number(process.env.EMAIL_VERIFICATION_RESEND_MIN_SECONDS || 60);
const RESEND_MAX_PER_DAY = Number(process.env.EMAIL_VERIFICATION_RESEND_MAX_PER_DAY || 10);

class AccountLifecycleService {
  getEmailDomain(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e.includes('@')) return '';
    return e.split('@').pop();
  }

  isPublicDomainEmail(email) {
    return PUBLIC_EMAIL_DOMAINS.includes(this.getEmailDomain(email));
  }

  buildLifecycleState(email, publicDomainAcknowledged = false) {
    const isPublic = this.isPublicDomainEmail(email);
    return {
      is_public_domain_email: isPublic ? 1 : 0,
      public_domain_acknowledged: isPublic && publicDomainAcknowledged ? 1 : 0,
      public_domain_acknowledged_at: isPublic && publicDomainAcknowledged ? new Date() : null,
      email_verified: 0,
      email_verified_at: null,
      account_status: 'pending_verification',
      is_active: 1
    };
  }

  assertPublicDomainAck(email, publicDomainAcknowledged) {
    if (this.isPublicDomainEmail(email) && !publicDomainAcknowledged) {
      const err = new Error(
        'Public email domains require acknowledgement for official/business use.'
      );
      err.status = 400;
      throw err;
    }
  }

  async issueVerificationToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);
    await pool.execute(
      `UPDATE users
       SET verification_token_hash = ?, verification_token_expires_at = ?,
           verification_sent_at = NOW(),
           verification_send_count = COALESCE(verification_send_count, 0) + 1
       WHERE id = ?`,
      [tokenHash, expiresAt, userId]
    );
    return { token, expiresAt };
  }

  async resendVerification(userId) {
    const [rows] = await pool.execute(
      `SELECT id, email, name, email_verified, account_status, verification_sent_at,
              COALESCE(verification_send_count, 0) AS verification_send_count
       FROM users
       WHERE id = ?`,
      [userId]
    );
    if (!rows.length) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    const user = rows[0];
    if (user.email_verified) {
      return { alreadyVerified: true, email: user.email, name: user.name };
    }
    const sentAt = user.verification_sent_at ? new Date(user.verification_sent_at) : null;
    if (sentAt && Date.now() - sentAt.getTime() < RESEND_MIN_SECONDS * 1000) {
      const err = new Error('Please wait before requesting another verification email.');
      err.status = 429;
      throw err;
    }
    if (Number(user.verification_send_count || 0) >= RESEND_MAX_PER_DAY) {
      const err = new Error('Daily resend limit reached. Please try again later.');
      err.status = 429;
      throw err;
    }
    const tokenData = await this.issueVerificationToken(user.id);
    return { ...tokenData, email: user.email, name: user.name, alreadyVerified: false };
  }

  async verifyByToken(rawToken) {
    const token = String(rawToken || '').trim();
    if (!token) {
      const err = new Error('Verification token is required.');
      err.status = 400;
      throw err;
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.execute(
      `SELECT id, email_verified, account_status, verification_token_expires_at
       FROM users
       WHERE verification_token_hash = ?`,
      [tokenHash]
    );
    if (!rows.length) {
      return { status: 'invalid' };
    }
    const user = rows[0];
    if (user.email_verified) {
      return { status: 'already_verified' };
    }
    if (!user.verification_token_expires_at || new Date(user.verification_token_expires_at) < new Date()) {
      return { status: 'expired', userId: user.id };
    }
    await pool.execute(
      `UPDATE users
       SET email_verified = 1,
           email_verified_at = NOW(),
           account_status = 'active',
           verification_token_hash = NULL,
           verification_token_expires_at = NULL
       WHERE id = ?`,
      [user.id]
    );
    return { status: 'verified', userId: user.id };
  }
}

module.exports = new AccountLifecycleService();
