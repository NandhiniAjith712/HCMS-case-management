import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentLogin from './AgentLogin';
import AdminDashboard from './AdminDashboard';
import './AdminRoute.css';

const AdminRoute = () => {
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if agent is already logged in
    const storedAgent = localStorage.getItem('agentData');
    const agentToken = localStorage.getItem('agentToken');
    
    if (storedAgent && agentToken) {
      try {
        const agentData = JSON.parse(storedAgent);
        setAgent(agentData);
      } catch (error) {
        console.error('Error parsing stored agent data:', error);
        localStorage.removeItem('agentData');
        localStorage.removeItem('agentToken');
      }
    }
    setLoading(false);
  }, []);

  const handleAgentLogin = (agentObj) => {
    setAgent(agentObj);
    // Store agent data in localStorage
    localStorage.setItem('agentData', JSON.stringify(agentObj));
    localStorage.setItem('agentToken', agentObj.token);
  };

  const handleLogout = () => {
    localStorage.removeItem('agentData');
    localStorage.removeItem('agentToken');
    setAgent(null);
    navigate('/admin');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // If agent is logged in, show admin dashboard
  if (agent) {
    return (
      <div>
        <button className="logout-btn" onClick={handleLogout}>
          ↗ Logout
        </button>
        <AdminDashboard agent={agent} />
      </div>
    );
  }

  // If no agent is logged in, show agent login
  return <AgentLogin onLogin={handleAgentLogin} />;
};

export default AdminRoute;
