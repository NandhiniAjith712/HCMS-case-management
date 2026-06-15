import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './GlobalLogin.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.message || 'Something went wrong');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="ticket-login-container">
        <div className="login-panel" style={{ maxWidth: '420px' }}>
          <div className="login-content">
            <h2>Check Your Email</h2>
            <p style={{ marginTop: '1rem', color: '#666' }}>
              If an account exists with that email, a password reset link has been sent.
              Please check your inbox and spam folder.
            </p>
            <Link to="/login" className="login-button" style={{ display: 'inline-block', marginTop: '1.5rem', textDecoration: 'none', textAlign: 'center' }}>
              Back to Login
            </Link>
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
            <h2>Forgot Password</h2>
            <p>Enter your email to receive a reset link</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <div className="input-icon">✉️</div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="form-input"
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <Link to="/login" style={{ display: 'block', marginTop: '1rem', color: '#666', textAlign: 'center', textDecoration: 'none' }}>
              Back to Login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
