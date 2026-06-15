import React, { useState } from 'react';
import BusinessDashboard from '../dashboards/BusinessDashboard';
import { buildApiUrl } from '../../utils/api';
import './BusinessDashboardAuth.css';

const BusinessDashboardAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check if we have a valid Business Dashboard token (issued by API)
    const token = localStorage.getItem('businessDashboardToken');
    const authTime = localStorage.getItem('businessDashboardAuthTime');
    
    if (!token || !authTime) return false;
    
    const timeDiff = Date.now() - parseInt(authTime);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff > 24) {
      localStorage.removeItem('businessDashboardToken');
      localStorage.removeItem('businessDashboardData');
      localStorage.removeItem('businessDashboardAuth');
      localStorage.removeItem('businessDashboardAuthTime');
      return false;
    }
    
    return true;
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await fetch(buildApiUrl('/api/auth/business-dashboard'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await response.json().catch(() => ({}));
      
      if (response.status === 404) {
        setError('API endpoint not found. Ensure the backend server is running and restarted after updates.');
        setPassword('');
        return;
      }
      
      if (data.success && data.data?.token) {
        localStorage.setItem('businessDashboardToken', data.data.token);
        localStorage.setItem('businessDashboardData', JSON.stringify(data.data.user || {}));
        localStorage.setItem('businessDashboardAuth', 'true');
        localStorage.setItem('businessDashboardAuthTime', Date.now().toString());
        setIsAuthenticated(true);
      } else {
        setError(data.message || 'Invalid password. Please try again.');
        setPassword('');
      }
    } catch (err) {
      console.error('Business dashboard auth error:', err);
      setError('Connection failed. Please try again.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div>
        <BusinessDashboard />
      </div>
    );
  }

  return (
    <div className="auth-page-ref">
      <div className="auth-card">
        <div className="auth-card__mark" aria-hidden>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div className="auth-header">
          <h1>Business dashboard access</h1>
          <p>Enter the password to open the business team dashboard.</p>
        </div>

        <form onSubmit={handlePasswordSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              className="password-input"
              autoComplete="current-password"
            />
          </div>

          {error ? <div className="error-message">{error}</div> : null}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Verifying…' : 'Access dashboard'}
          </button>
        </form>

        <div className="auth-footer">
          <p>This area is protected and requires authentication.</p>
        </div>
      </div>
    </div>
  );
};

export default BusinessDashboardAuth;
