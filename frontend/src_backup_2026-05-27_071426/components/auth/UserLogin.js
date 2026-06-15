import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './UserLogin.css';

const UserLogin = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setLoading(true);
    setError('');

    try {
      console.log('Customer login attempt:', { email: email.trim() });
      
      const response = await fetch('http://localhost:5000/api/users/login-by-email', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email: email.trim() })
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
        // Store user data
        localStorage.setItem('userData', JSON.stringify(data.data.user));
        
        // Store JWT token if provided
        if (data.data.token) {
          localStorage.setItem('userToken', data.data.token);
        }
        
        if (onLogin) onLogin(data.data.user);
        
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
    <div className="user-login-container">
      <div className="user-login-card">
        <div className="user-login-header">
          <h2>Customer Login</h2>
          <p>Enter your email to access your tickets and support history</p>
        </div>

        <div className="test-email-section">
          <h4>Test Email:</h4>
          <p>Email: user@example.com</p>
        </div>

        <form className="user-login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
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
            disabled={loading || !email.trim()}
          >
            {loading ? 'Signing in...' : 'Access My Tickets'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UserLogin;
