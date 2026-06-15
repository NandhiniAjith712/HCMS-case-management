import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import './GlobalLogin.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const IconMail = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const IconLock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconEye = ({ off }) =>
  off ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

const IconTicket = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
    <path d="M13 5v2M13 17v2M13 11v2" />
  </svg>
);

const IconArrow = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const GlobalLogin = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = (() => {
    const raw = String(searchParams.get('returnTo') || '').trim();
    return raw && raw.startsWith('/') ? raw : '';
  })();

  useEffect(() => {
    const remembered = localStorage.getItem('remembered_login_id');
    const rememberedPw = localStorage.getItem('remembered_password');
    const emailFromLink = String(searchParams.get('email') || searchParams.get('e') || '').trim();
    if (emailFromLink) {
      setFormData((f) => ({ ...f, email: emailFromLink }));
      return;
    }
    if (remembered) {
      setFormData((f) => ({ ...f, email: remembered, password: rememberedPw || '' }));
      setRememberMe(true);
    }
  }, [searchParams]);

  const [sessionRedirect, setSessionRedirect] = useState(null);
  useEffect(() => {
    if (returnTo) {
      const stored = sessionStorage.getItem('staffData') || sessionStorage.getItem('userData');
      const expires = sessionStorage.getItem('session_expires');
      if (stored && expires && new Date() < new Date(expires)) {
        setSessionRedirect(returnTo);
        return;
      }
    }
    const stored = sessionStorage.getItem('staffData') || sessionStorage.getItem('userData');
    const expires = sessionStorage.getItem('session_expires');
    if (stored && expires && new Date() < new Date(expires)) {
      try {
        const userData = JSON.parse(stored);
        const role = userData.role;
        if (role === 'support_agent' || role === 'admin') {
          setSessionRedirect('/agentdashboard');
          return;
        }
        if (role === 'support_manager' || role === 'manager') {
          setSessionRedirect('/manager');
          return;
        }
        if (role === 'ceo') {
          setSessionRedirect('/ceo');
          return;
        }
      } catch {}
    }
  }, [returnTo]);
  if (sessionRedirect) return <Navigate to={sessionRedirect} replace />;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!formData.email || !formData.password) {
        setError('Please enter both email and password');
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE}/auth/global-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });

      const data = await response.json();

      if (!data.success && response.status === 403) {
        setError(data.message || 'Sign-in was denied.');
        setLoading(false);
        return;
      }

      if (data.success) {
        const userJson = JSON.stringify(data.data.user);
        const expiresIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        [localStorage, sessionStorage].forEach((s) => {
          s.setItem('staffData', userJson);
          s.setItem('is_logged_in', 'true');
          s.setItem('session_expires', expiresIso);
        });
        if (data.data.token) {
          [localStorage, sessionStorage].forEach((s) => s.setItem('staffToken', data.data.token));
        }
        localStorage.setItem('login_timestamp', new Date().toISOString());

        if (rememberMe) {
          localStorage.setItem('remembered_login_id', formData.email);
          localStorage.setItem('remembered_password', formData.password);
        }

        const { role } = data.data.user;
        const staffRoles = ['support_agent', 'admin', 'support_manager', 'manager', 'ceo'];
        if (!staffRoles.includes(role)) {
          ['staffData', 'staffToken', 'session_expires', 'is_logged_in'].forEach((k) => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
          });
          setError(
            'This sign-in page is for support staff only. Customers should use Customer Access or their product support link.'
          );
          setLoading(false);
          return;
        }

        if (onLogin) {
          onLogin(data.data.user);
        }

        if (returnTo) {
          navigate(returnTo, { replace: true });
        } else if (role === 'support_agent' || role === 'admin') {
          navigate('/agentdashboard', { replace: true });
        } else if (role === 'support_manager' || role === 'manager') {
          navigate('/manager', { replace: true });
        } else if (role === 'ceo') {
          navigate('/ceo', { replace: true });
        }
      } else {
        setError(data.message || 'Login failed');
        if (data.requires_password_setup) {
          setError(data.message || 'Please set up your password first. Use the setup link from your administrator.');
        }
      }
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('403')) {
        setError('Invalid email or password. Please check your credentials.');
      } else if (err.message.includes('fetch')) {
        setError('Network error. Please check if the server is running.');
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gl-auth gl-auth-ref">
      <div className="gl-auth__layout">
        <aside className="gl-auth__brand">
          <div className="gl-auth__logo">
            <span className="gl-auth__logo-icon">
              <IconTicket />
            </span>
            <span className="gl-auth__logo-text">ITSM Ticketing</span>
          </div>
          <h1 className="gl-auth__headline">Professional ticket management</h1>
          <p className="gl-auth__lede">
            Streamline support operations with a single place for tickets, SLAs, and customer conversations—built for
            modern IT service teams.
          </p>
        </aside>

        <div className="gl-auth__panel">
          <div className="gl-auth__card">
            <header className="gl-auth__card-head">
              <h2>Welcome</h2>
              <p>Sign in to your dashboard</p>
            </header>

            <form className="gl-auth__form" onSubmit={handleSubmit}>
              <div className="gl-auth__field">
                <label className="gl-auth__label" htmlFor="gl-email">
                  Email
                </label>
                <div className="gl-auth__input-wrap">
                  <span className="gl-auth__input-icon" aria-hidden>
                    <IconMail />
                  </span>
                  <input
                    type="email"
                    id="gl-email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@company.com"
                    className="gl-auth__input"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="gl-auth__field">
                <label className="gl-auth__label" htmlFor="gl-password">
                  Password
                </label>
                <div className="gl-auth__input-wrap">
                  <span className="gl-auth__input-icon" aria-hidden>
                    <IconLock />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="gl-password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    className="gl-auth__input gl-auth__input--password"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="gl-auth__toggle-pw"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <IconEye off={showPassword} />
                  </button>
                </div>
              </div>

              {error ? <div className="gl-auth__error">{error}</div> : null}

              <Link to="/staff/forgot-password" className="gl-auth__link">
                Forgot password?
              </Link>

              <label className="gl-auth__remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me for 7 days</span>
              </label>

              <button type="submit" className="gl-auth__submit" disabled={loading}>
                <span>{loading ? 'Signing in…' : 'Sign in'}</span>
                {!loading ? <IconArrow /> : null}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalLogin;
