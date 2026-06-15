import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { buildApiUrl, isCustomerSessionValid } from '../../utils/api';
import {
  CUSTOMER_ACCESS_STATES,
  getSessionDecision,
  resolveAccessState,
  stateToCustomerStep
} from '../../utils/customerAccessResolver';
import './CustomerAccessPage.css';

const MailIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 2v.5l8 5 8-5V8l-8 5-8-5z" fill="currentColor" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
    <path d="M17 9h-1V7a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 1 1 4 0v2h-4V7z" fill="currentColor" />
  </svg>
);

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'zoho.com',
  'googlemail.com'
]);

const isLikelyPublicDomainEmail = (rawEmail) => {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email.includes('@')) return false;
  const domain = email.split('@')[1] || '';
  return PUBLIC_EMAIL_DOMAINS.has(domain);
};

/**
 * Customer Access - For returning customers to create password or login with email+password.
 * URL params: e (email), returnTo (encoded path). returnTo format: /{product}?m=&u=&e=
 */
const CustomerAccessPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState('email'); // email | create-password | login | verify-pending | not-found
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [isPublicDomainEmail, setIsPublicDomainEmail] = useState(false);
  const [publicDomainAcknowledged, setPublicDomainAcknowledged] = useState(false);
  const [verifyResult, setVerifyResult] = useState('');
  const forcedState = (searchParams.get('state') || '').trim();
  const forcedStep = (searchParams.get('step') || '').trim();

  const returnTo = searchParams.get('returnTo') || '';
  const autoCheckDoneRef = React.useRef(false);
  const logDecision = (label, payload) => console.log(`[customer-access] ${label}`, payload);
  const shouldRequirePublicDomainAck = isPublicDomainEmail || isLikelyPublicDomainEmail(email);
  const prefilledName = (() => {
    try {
      const ret = searchParams.get('returnTo') || '';
      if (!ret) return '';
      const decoded = decodeURIComponent(ret);
      const queryPart = decoded.includes('?') ? decoded.split('?')[1] : '';
      if (!queryPart) return '';
      return new URLSearchParams(queryPart).get('u') || '';
    } catch {
      return '';
    }
  })();

  const navigateToSupport = (user) => {
    let dest = returnTo ? (returnTo.startsWith('/') ? returnTo : `/${returnTo}`) : '';
    let hasValidEmailInDest = false;
    if (dest) {
      try {
        const query = dest.includes('?') ? dest.split('?')[1] : '';
        hasValidEmailInDest = !!(new URLSearchParams(query).get('e') || '').trim();
      } catch (_) {
        hasValidEmailInDest = false;
      }
    }
    if (!hasValidEmailInDest) {
      const params = new URLSearchParams({ e: user.email });
      if (user.name) params.set('u', user.name);
      params.set('m', '');
      dest = `/grc?${params.toString()}`;
    }
    const match = dest.match(/^\/([^/?#]+)(?:\?|$)/);
    const product = match ? decodeURIComponent(match[1]) : 'grc';
    localStorage.setItem('autoLoginContext', JSON.stringify({
      email: user.email,
      name: user.name,
      product,
      utmDescription: product,
      sourcePlatform: product,
      source: 'support-url',
      timestamp: new Date().toISOString()
    }));
    logDecision('AUTHENTICATED_DASHBOARD_ACCESS', { email: user.email, dest });
    navigate(dest, { replace: true });
  };

  useEffect(() => {
    const verifyToken = searchParams.get('verify_token');
    const verifyEmail = (searchParams.get('email') || searchParams.get('e') || '').trim();
    if (!verifyToken) return;
    const runVerification = async () => {
      setLoading(true);
      setError('');
      setVerifyResult('');
      try {
        const res = await fetch(buildApiUrl('/api/auth/verify-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: verifyToken, email: verifyEmail || undefined })
        });
        const data = await res.json();
        if (data.success) {
          const resolvedEmail = verifyEmail || data.email || email;
          if (resolvedEmail) setEmail(resolvedEmail);

          if (data.hasPassword === false) {
            setStep('create-password');
          } else {
            setVerifyResult(
              data.status === 'already_verified'
                ? (data.accessLinkEmailSent
                  ? 'Email already verified. We have sent your support access link to your email.'
                  : 'Email already verified.')
                : (data.accessLinkEmailSent
                  ? 'Email verified successfully. Your support access link has been sent to your email.'
                  : 'Email verified successfully.')
            );
            setStep('verify-pending');
          }
        } else {
          setVerifyResult(data.message || 'Verification failed.');
          setStep('verify-pending');
        }
      } catch (e) {
        setVerifyResult('Unable to verify email right now. Please try again.');
        setStep('verify-pending');
      } finally {
        setLoading(false);
      }
    };
    runVerification();
  }, [searchParams, email]);

  useEffect(() => {
    const urlEmail = searchParams.get('e') || searchParams.get('email');
    if (urlEmail && urlEmail.includes('@')) {
      setEmail(urlEmail.trim());
    }
  }, [searchParams]);

  const applyAccessState = (accessState, payload = {}) => {
    const next = stateToCustomerStep(accessState);
    setHasPassword(!!payload.hasPassword);
    setIsPublicDomainEmail(!!payload.isPublicDomainEmail);
    setPublicDomainAcknowledged(!!payload.publicDomainAcknowledged || !payload.isPublicDomainEmail);
    if (accessState === CUSTOMER_ACCESS_STATES.PENDING_EMAIL_VERIFICATION) {
      setVerifyResult(payload.message || 'Your account is pending email verification.');
    }
    setStep(next);
    logDecision('apply_access_state', { accessState, next, email: payload.email || email });
  };

  useEffect(() => {
    const urlEmail = searchParams.get('e') || searchParams.get('email');
    if (!urlEmail || !urlEmail.includes('@') || autoCheckDoneRef.current || step !== 'email') return;
    autoCheckDoneRef.current = true;
    const check = async () => {
      setLoading(true);
      setError('');
      try {
        const session = getSessionDecision(urlEmail.trim(), isCustomerSessionValid);
        if (session.valid) {
          navigateToSupport(session.user);
          return;
        }
        const res = await fetch(buildApiUrl('/api/auth/customers/check-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: urlEmail.trim() })
        });
        const data = await res.json();
        if (!data.success) return;
        setEmail(urlEmail.trim());
        const state = resolveAccessState({
          backendState: forcedState || data.accessState,
          exists: data.exists,
          hasPassword: data.hasPassword,
          emailVerified: data.emailVerified,
          accountStatus: data.accountStatus
        });
        if (forcedStep) {
          setStep(forcedStep);
          return;
        }
        applyAccessState(state, { ...data, email: urlEmail.trim() });
      } catch {
        autoCheckDoneRef.current = false;
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [searchParams, step]);

  const handleCheckEmail = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/auth/customers/check-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Could not verify email');
        return;
      }
      const state = resolveAccessState({
        backendState: forcedState || data.accessState,
        exists: data.exists,
        hasPassword: data.hasPassword,
        emailVerified: data.emailVerified,
        accountStatus: data.accountStatus
      });
      applyAccessState(state, { ...data, email: email.trim() });
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (shouldRequirePublicDomainAck && !publicDomainAcknowledged) {
      setError('Please acknowledge public email usage for official/business purpose.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/auth/customers/set-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: prefilledName || undefined,
          public_domain_acknowledged: !!publicDomainAcknowledged
        })
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to create password');
        return;
      }
      if (data.requiresEmailVerification) {
        setStep('verify-pending');
        setVerifyResult(data.message || 'Verify your email to continue.');
        return;
      }
      const { user, token } = data.data;
      localStorage.setItem('customerData', JSON.stringify(user));
      localStorage.setItem('customerToken', token);
      if (onLogin) onLogin(user);
      navigateToSupport(user);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/auth/customers/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();
      if (!data.success) {
        const message = data.message || 'Login failed';
        setError(message);
        const failState = resolveAccessState({ backendState: data.accessState });
        if (failState) applyAccessState(failState, { ...data, email: email.trim(), message });
        // Recovery guard: re-check account state and route to the correct screen.
        if (!data.requiresEmailVerification) {
          try {
            const checkRes = await fetch(buildApiUrl('/api/auth/customers/check-email'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email.trim() })
            });
            const checkData = await checkRes.json();
            if (checkData?.success) {
              const state = resolveAccessState({
                backendState: checkData.accessState,
                exists: checkData.exists,
                hasPassword: checkData.hasPassword,
                emailVerified: checkData.emailVerified,
                accountStatus: checkData.accountStatus
              });
              applyAccessState(state, { ...checkData, email: email.trim() });
            }
          } catch (_) {
            // Keep original login error; no-op on recovery check failure.
          }
        }
        return;
      }
      const { user, token } = data.data;
      localStorage.setItem('customerData', JSON.stringify(user));
      localStorage.setItem('customerToken', token);
      if (onLogin) onLogin(user);
      navigateToSupport(user);
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setError('');
    setVerifyResult('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleResendVerification = async () => {
    if (!email || !email.includes('@')) {
      setError('Enter a valid email first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/auth/customers/resend-verification'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to resend verification email');
        return;
      }
      setVerifyResult(data.message || 'Verification email sent.');
    } catch (e) {
      setError('Unable to resend right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customer-access-page">
      <div className="customer-access-card">
        <div className="customer-access-header">
          <h1>Customer Access</h1>
          <p>Access your support tickets</p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleCheckEmail} className="customer-access-form">
            <p className="form-hint">Enter your email to continue. If you&apos;ve used our support before, you can create a password or sign in.</p>
            <div className="form-group">
              <label>Email</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true"><MailIcon /></span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 'create-password' && (
          <form onSubmit={handleSetPassword} className="customer-access-form">
            <p className="form-hint">Create a password to access your tickets in the future.</p>
            <div className="form-group">
              <label>Email</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true"><MailIcon /></span>
                <input type="email" value={email} readOnly disabled className="readonly" />
              </div>
            </div>
            <div className="form-group">
              <label>New Password (min 6 characters)</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true"><LockIcon /></span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  minLength={6}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true"><LockIcon /></span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  required
                />
              </div>
            </div>
            {shouldRequirePublicDomainAck && (
              <div className="form-group">
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    className="public-domain-ack-checkbox"
                    checked={publicDomainAcknowledged}
                    onChange={(e) => setPublicDomainAcknowledged(e.target.checked)}
                  />
                  <span>
                    I acknowledge this public email is used for official/business purpose and is not an organization domain email.
                  </span>
                </label>
              </div>
            )}
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Password & Sign In'}
            </button>
            <button type="button" className="btn-link" onClick={handleBack}>← Back</button>
          </form>
        )}

        {step === 'verify-pending' && (
          <div className="customer-access-form">
            {verifyResult && (verifyResult.toLowerCase().includes('verified successfully') || verifyResult.toLowerCase().includes('already verified')) ? (
              <p className="form-hint" style={{ color: '#10b981', fontWeight: 600 }}>✅ {verifyResult}</p>
            ) : (
              <p className="form-hint">Your account is pending email verification.</p>
            )}
            {verifyResult && !(verifyResult.toLowerCase().includes('verified successfully') || verifyResult.toLowerCase().includes('already verified')) ? (
              <div className="error-msg">{verifyResult}</div>
            ) : null}
            {error ? <div className="error-msg">{error}</div> : null}
            <button type="button" className="btn-primary" onClick={handleResendVerification} disabled={loading}>
              {loading ? 'Sending...' : 'Resend Verification Email'}
            </button>
            <button type="button" className="btn-link" onClick={handleBack}>← Back</button>
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className="customer-access-form">
            <p className="form-hint">Sign in with your email and password.</p>
            <div className="form-group">
              <label>Email</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true"><MailIcon /></span>
                <input type="email" value={email} readOnly disabled className="readonly" />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="input-with-icon">
                <span className="input-icon" aria-hidden="true"><LockIcon /></span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setError('');
                setPassword('');
                setStep('create-password');
              }}
            >
              No password yet? Create one
            </button>
            <button type="button" className="btn-link" onClick={handleBack}>← Back</button>
          </form>
        )}

        {step === 'not-found' && (
          <div className="customer-access-form">
            <p className="form-hint">No account found for this email. Please use your support link (from email or bookmark) to access support and create tickets.</p>
            <button type="button" className="btn-primary" onClick={handleBack}>Try Another Email</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerAccessPage;
