import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AutoLoginTest.css';

const AutoLoginTest = () => {
  const [email, setEmail] = useState('');
  const [product, setProduct] = useState('');
  const [phone, setPhone] = useState('');
  const navigate = useNavigate();

  const handleTestSupportUrl = () => {
    console.log('🧪 Testing Universal Support URL with:', { email, product });
    
    // Navigate to support URL: /{product}?m=&u=&e=
    const params = new URLSearchParams({ e: email });
    params.set('m', '');
    navigate(`/${encodeURIComponent(product)}?${params.toString()}`);
  };

  const handleTestBusinessDashboard = () => {
    console.log('🧪 Testing business dashboard access');
    navigate('/businessdashboard');
  };

  const handleTestDirectDashboard = () => {
    console.log('🧪 Testing direct dashboard access');
    navigate('/dashboard');
  };

  const handleClearStorage = () => {
    console.log('🧹 Clearing all storage');
    localStorage.clear();
    window.location.reload();
  };

  const handleShowStorage = () => {
    console.log('📦 Current localStorage contents:');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      console.log(`${key}:`, value);
    }
  };

  return (
    <div className="auto-login-test">
      <h1>🧪 Support URL Test Page</h1>
      
      <div className="test-section">
        <h2>Test Universal Support URL</h2>
        <p className="test-hint">URL format: /&#123;product&#125;?m=&amp;u=&amp;e=&#123;email&#125;</p>
        <div className="form-group">
          <label>Email:</label>
          <input 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email"
          />
        </div>
        
        <div className="form-group">
          <label>Product:</label>
          <input 
            type="text" 
            value={product} 
            onChange={(e) => setProduct(e.target.value)}
            placeholder="Enter product"
          />
        </div>
        
        <div className="form-group">
          <label>Phone (optional):</label>
          <input 
            type="text" 
            value={phone} 
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter phone"
          />
        </div>
        <button onClick={handleTestSupportUrl} className="test-btn">
          🚀 Test Support URL
        </button>
      </div>

      <div className="test-section">
        <h2>Test Other Routes</h2>
        <button onClick={handleTestBusinessDashboard} className="test-btn">
          🏢 Test Business Dashboard
        </button>
        
        <button onClick={handleTestDirectDashboard} className="test-btn">
          📊 Test Direct Dashboard
        </button>
      </div>

      <div className="test-section">
        <h2>Debug Tools</h2>
        <button onClick={handleShowStorage} className="debug-btn">
          📦 Show Storage Contents
        </button>
        
        <button onClick={handleClearStorage} className="debug-btn danger">
          🗑️ Clear All Storage
        </button>
      </div>

      <div className="info-section">
        <h3>📋 Test Instructions:</h3>
        <ol>
          <li>Enter email and product (e.g. grc, voiceloop) - product must exist in the system</li>
          <li>Click "Test Support URL" to test the Universal Support URL flow</li>
          <li>Use debug tools to inspect storage and clear data</li>
        </ol>
        
        <h3>🔍 Expected Behavior:</h3>
        <ul>
          <li>Support URL should find/create user and redirect to dashboard</li>
          <li>Form will be pre-filled with product from the URL</li>
        </ul>
      </div>
    </div>
  );
};

export default AutoLoginTest;
