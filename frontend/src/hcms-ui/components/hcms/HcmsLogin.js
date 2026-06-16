import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_DASHBOARD_ROUTE } from '../../modules/auth/constants';

/**
 * HCMS Login Page — authenticates against /api/v2/auth/login
 * and redirects to the role-appropriate dashboard.
 */
function HcmsLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, user, isLoading, isAuthenticated } = useAuth();

  // If already logged in, redirect to the role-based dashboard.
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const target = ROLE_DASHBOARD_ROUTE[user.role] || '/hcms/employee';
      navigate(target, { replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v2/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || 'Login failed. Please try again.');
        return;
      }

      login(data.token, data.user);

      // Redirect to originally requested page, or role-based dashboard.
      if (from) {
        navigate(from, { replace: true });
      } else {
        const target = ROLE_DASHBOARD_ROUTE[data.user.role] || '/hcms/employee';
        navigate(target, { replace: true });
      }
    } catch (err) {
      console.error('[HcmsLogin] error:', err);
      setError('Network error. Please check that the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>HCMS Sign In</h2>
        <p style={styles.subtitle}>Employee / HR / Department Head / Admin</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              style={styles.input}
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={styles.testHint}>
          <small>
            Test accounts:<br />
            employee@hcms.test / hr@hcms.test / depthead@hcms.test / admin@hcms.test<br />
            Password: <strong>Test@123</strong>
          </small>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: '#f5f6fa'
  },
  card: {
    width: 380,
    padding: 32,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
  },
  title: { margin: '0 0 4px', fontSize: 22 },
  subtitle: { margin: '0 0 24px', color: '#666', fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 600, color: '#333' },
  input: {
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #ddd',
    borderRadius: 6,
    outline: 'none'
  },
  error: {
    padding: 10,
    background: '#fff0f0',
    color: '#c00',
    borderRadius: 6,
    fontSize: 13
  },
  button: {
    padding: 12,
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    background: '#2563eb',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer'
  },
  testHint: {
    marginTop: 16,
    padding: 10,
    background: '#f0f7ff',
    borderRadius: 6,
    color: '#444',
    fontSize: 12,
    lineHeight: 1.5
  }
};

export default HcmsLogin;
