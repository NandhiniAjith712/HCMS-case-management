import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './StaffLogin.css';

const StaffLogin = ({ onLogin }) => {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loginId.trim() || !password.trim()) {
      setError('Please enter both Login ID and Password');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      console.log('Staff login attempt:', { loginId: loginId.trim() });
      
      const response = await fetch('http://localhost:5000/api/staff/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          login_id: loginId.trim(),
          password: password
        })
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log('Response data:', errorData);
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        // Store staff data
        localStorage.setItem('staffData', JSON.stringify(data.data.staff));
        
        // Store JWT token if provided
        if (data.data.token) {
          localStorage.setItem('staffToken', data.data.token);
        }
        
        if (onLogin) onLogin(data.data.staff);
        
        // Navigate to dashboard
        navigate('/');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="staff-login-container">
      <div className="staff-login-card">
        <div className="staff-login-header">
          <h2>Staff Login Portal</h2>
          <p>Enter your Login ID and Password to access the system</p>
        </div>

        <div className="login-info-section">
          <h4>Login Information:</h4>
          <p>• <strong>Login ID:</strong> Auto-generated when account is created</p>
          <p>• <strong>Password:</strong> Auto-generated when account is created</p>
          <p>• <strong>Role:</strong> Automatically detected based on your account</p>
        </div>

        <form className="staff-login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="loginId">Login ID</label>
            <input
              type="text"
              id="loginId"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Enter your Login ID"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your Password"
              className="form-input"
              required
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <p>Need help? Contact your system administrator</p>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
