import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './GlobalLogin.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
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
    if (!token) {
      setError('Invalid or missing reset link');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        setError(data.message || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="ticket-login-container">
        <div className="login-panel" style={{ maxWidth: '420px' }}>
          <div className="login-content">
            <h2>Invalid Link</h2>
            <p style={{ marginTop: '1rem', color: '#666' }}>
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <button className="login-button" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/login')}>
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="ticket-login-container">
        <div className="login-panel" style={{ maxWidth: '420px' }}>
          <div className="login-content">
            <h2>Password Reset Successfully</h2>
            <p style={{ marginTop: '1rem', color: '#28a745' }}>
              You can now log in with your new password. Redirecting...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ticket-login-container">
      <div className="login-panel" style={{ maxWidth: '420px' }}>
        <div className="login-content">
          <div className="login-header">
            <h2>Reset Your Password</h2>
            <p>Enter your new password</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <div className="input-icon">🔒</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (min 6 characters)"
                className="form-input"
                required
                minLength={6}
              />
            </div>
            <div className="input-group">
              <div className="input-icon">🔒</div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="form-input"
                required
                minLength={6}
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button type="button" style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer' }} onClick={() => navigate('/login')}>
              Cancel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
