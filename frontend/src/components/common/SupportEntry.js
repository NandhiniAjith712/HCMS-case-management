import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { buildApiUrl, isCustomerSessionValid } from '../../utils/api';
import { getSessionDecision, resolveAccessState, stateToCustomerStep } from '../../utils/customerAccessResolver';
import UserDashboard from '../dashboards/UserDashboard';
import './SupportEntry.css';

/**
 * Universal Support URL Entry Point
 * Standard URL format: {base_url}/{product}?m={module_name}&u={user_name}&e={email_id}
 * Product in path only. Use e as unique user identifier.
 *
 * Workflow:
 * - Valid session + matching email → UserDashboard
 * - No/expired session → redirect to customer-access (authentication gate)
 */
const SupportEntry = ({ onLogin }) => {
  const { product: productUtm } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [error, setError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(null);
  const hasAttemptedRef = React.useRef(false);
  const lastEmailRef = React.useRef(null);
  const logDecision = (label, payload) => console.log(`[support-entry] ${label}`, payload);

  useEffect(() => {
    const normalizedProduct = String(productUtm || '').trim().toLowerCase();
    if (normalizedProduct && normalizedProduct !== String(productUtm || '').trim()) {
      const qs = searchParams.toString();
      navigate(`/${encodeURIComponent(normalizedProduct)}${qs ? `?${qs}` : ''}`, { replace: true });
      return;
    }

    const emailParam = String(searchParams.get('e') || searchParams.get('user_email') || '').trim();
    const emailChanged = lastEmailRef.current !== null && lastEmailRef.current !== emailParam;

    if (emailChanged) {
      lastEmailRef.current = emailParam;
      hasAttemptedRef.current = false;
      setStatus('loading');
      setError('');
      setLoggedInUser(null);
    }

    if (hasAttemptedRef.current) return;
    hasAttemptedRef.current = true;
    lastEmailRef.current = emailParam;

    const performSupportLogin = async () => {
      const emailParam = String(searchParams.get('e') || searchParams.get('user_email') || '').trim();
      const userName = searchParams.get('u') || searchParams.get('user_name');
      const moduleName = searchParams.get('m');

      if (!emailParam || !emailParam.includes('@')) {
        setError('Query parameter e (email) is required. Example: ?e=user@example.com');
        setStatus('error');
        return;
      }

      // Valid session with matching email → use existing session, update context, show dashboard
      const session = getSessionDecision(emailParam, isCustomerSessionValid);
      if (session.valid) {
        try {
          const customerData = session.user;
          const context = {
            email: customerData.email,
            name: customerData.name,
            product: normalizedProduct || moduleName,
            utmSource: moduleName,
            utmMedium: null,
            utmModule: moduleName,
            phone: customerData.phone,
            timestamp: new Date().toISOString(),
            source: 'support-url',
            sourcePlatform: normalizedProduct || moduleName
          };
          localStorage.setItem('autoLoginContext', JSON.stringify(context));
          setLoggedInUser({
            ...customerData,
            _supportMeta: { isNewUser: false, hasTickets: true }
          });
          setStatus('success');
          if (onLogin) onLogin(customerData);
          logDecision('AUTHENTICATED_DASHBOARD_ACCESS', { email: emailParam, source: 'session' });
        } catch {
          setStatus('loading');
          hasAttemptedRef.current = false;
        }
        return;
      }

      // No valid session: resolve next state from backend truth.
      const returnParams = new URLSearchParams({ e: emailParam });
      if (userName) returnParams.set('u', userName);
      if (moduleName !== null) returnParams.set('m', moduleName);
      const returnTo = `/${encodeURIComponent(normalizedProduct || 'grc')}?${returnParams.toString()}`;
      let accessState = 'LOGIN_REQUIRED';
      try {
        const res = await fetch(buildApiUrl('/api/auth/customers/check-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailParam })
        });
        const data = await res.json();
        if (data?.success) {
          accessState = resolveAccessState({
            backendState: data.accessState,
            exists: data.exists,
            hasPassword: data.hasPassword,
            emailVerified: data.emailVerified,
            accountStatus: data.accountStatus
          });
        }
      } catch (_) {
        // Keep default login-required state on transient API failures.
      }
      const targetStep = stateToCustomerStep(accessState);
      logDecision('redirect_to_customer_access', { email: emailParam, accessState, targetStep, returnTo });
      navigate(
        `/customer-access?e=${encodeURIComponent(emailParam)}&state=${encodeURIComponent(accessState)}&step=${encodeURIComponent(targetStep)}&returnTo=${encodeURIComponent(returnTo)}`,
        { replace: true }
      );
    };

    performSupportLogin();
  }, [productUtm, searchParams]); // onLogin omitted - stable deps to prevent re-run loop

  if (status === 'loading') {
    return (
      <div className="support-entry">
        <div className="support-entry-content">
          <div className="support-entry-spinner" />
          <h2>Connecting to Support...</h2>
          <p>Loading {productUtm} support environment</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    const isEmailError = error && error.includes('e (email)');
    return (
      <div className="support-entry">
        <div className="support-entry-content support-entry-error">
          <h2>Support Login Failed</h2>
          <p className="support-entry-error-msg">{error}</p>
          {isEmailError && (
            <p className="support-entry-hint" style={{ marginTop: 12, color: '#94a3b8', fontSize: 14 }}>
              If you received this link from a staff notification (e.g. ticket assignment or priority change), use the button below to sign in to your dashboard.
            </p>
          )}
          <a href="/login" className="support-entry-btn">Go to Login</a>
        </div>
      </div>
    );
  }

  // Success: render UserDashboard (support page) on same URL
  if (status === 'success' && loggedInUser) {
    const { _supportMeta, ...user } = loggedInUser;
    return (
      <UserDashboard
        user={user}
        isFirstTimeSupportUser={_supportMeta?.hasTickets === false}
        initialShowForm={_supportMeta?.hasTickets === false}
      />
    );
  }

  return (
    <div className="support-entry">
      <div className="support-entry-content">
        <div className="support-entry-spinner" />
        <p>Loading...</p>
      </div>
    </div>
  );
};

export default SupportEntry;
