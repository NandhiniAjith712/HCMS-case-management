import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

const LoginPage = () => {
  const [selectedType, setSelectedType] = useState('customer');
  const navigate = useNavigate();

  const handleUserLogin = () => {
    setSelectedType('customer');
    navigate('/user/login');
  };

  const handleStaffLogin = () => {
    setSelectedType('staff');
    navigate('/staff/login');
  };

  return (
    <div className="login-page-container lp-auth-ref">
      <div className="login-tab-bar">
        <button 
          className={`tab-button ${selectedType === 'customer' ? 'active' : ''}`}
          onClick={handleUserLogin}
        >
          <div className="tab-icon">👤</div>
          <span className="tab-text">Customer Login</span>
        </button>

        <button 
          className={`tab-button ${selectedType === 'staff' ? 'active' : ''}`}
          onClick={handleStaffLogin}
        >
          <div className="tab-icon">👨‍💼</div>
          <span className="tab-text">Staff Login</span>
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
