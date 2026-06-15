import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AgentLogin.css';

const AgentLogin = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
      console.log('🔍 Agent login attempt:', formData);
      
      // Validate form data
      if (!formData.name || !formData.password) {
        setError('Please enter both name and password');
        setLoading(false);
        return;
      }
      
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long');
        setLoading(false);
        return;
      }
      
      const response = await fetch('http://localhost:5000/api/agents/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      console.log('📡 Response status:', response.status);
      
      const data = await response.json();
      console.log('📥 Response data:', data);

      if (data.success) {
        console.log('✅ Login successful, storing agent data');
        
        // Convert agent data to user format for consistency with GlobalLogin
        // Map agent role to support_agent for proper routing
        let agentRole = data.data.agent.role;
        if (agentRole === 'agent' || !agentRole) {
          agentRole = 'support_agent';
        }
        
        const userData = {
          id: data.data.agent.id,
          name: data.data.agent.name,
          email: data.data.agent.email,
          role: agentRole,
          department: data.data.agent.department,
          manager_id: data.data.agent.manager_id,
          is_active: data.data.agent.is_active,
          last_login: data.data.agent.last_login,
          dashboard_type: 'staff',
          user_type: 'agent'
        };
        
        console.log('🔍 Mapped agent role:', agentRole, 'from original role:', data.data.agent.role);
        console.log('📊 Complete userData object:', userData);
        
        // Store user data in the same format as GlobalLogin
        localStorage.setItem('userData', JSON.stringify(userData));
        
        // Store JWT token
        if (data.data.token) {
          localStorage.setItem('userToken', data.data.token);
        }
        
        // Store session persistence data
        localStorage.setItem('is_logged_in', 'true');
        localStorage.setItem('login_timestamp', new Date().toISOString());
        localStorage.setItem('session_expires', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
        
        // Update App.js user state first
        if (onLogin) {
          console.log('🔄 Calling onLogin to update App.js state');
          onLogin(userData);
        }
        
        // Add a small delay to ensure state is updated before navigation
        console.log('⏳ Waiting 100ms before navigation...');
        setTimeout(() => {
          console.log('🔄 FORCE REDIRECT: Agent to /agentdashboard');
          navigate('/agentdashboard', { replace: true });
        }, 100);
      } else {
        console.error('❌ Login failed:', data.message);
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      console.error('❌ Network error:', err);
      
      // If it's a 401 error, show a specific message
      if (err.message.includes('401')) {
        setError('Invalid name/email or password. Please check your credentials.');
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
    <div className="agent-login-container">
      <div className="agent-login-card">
        <div className="agent-login-header">
          <h2>Agent Login</h2>
          <p>Welcome back! Please sign in to your account.</p>
          <div style={{ 
            background: '#f0f8ff', 
            padding: '10px', 
            borderRadius: '5px', 
            marginTop: '10px',
            fontSize: '12px',
            color: '#666'
          }}>
            <strong>Test Credentials:</strong><br/>
            Name: <code>admin</code> | Password: <code>admin123</code>
          </div>
        </div>

        <form className="agent-login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Agent Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter your name"
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
              className="form-input"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            className="login-button" 
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="agent-login-footer">
          <p>Need help? Contact your manager or business team.</p>
        </div>
      </div>
    </div>
  );
};

export default AgentLogin; 