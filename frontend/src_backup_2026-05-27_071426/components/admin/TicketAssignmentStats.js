import React, { useState, useEffect } from 'react';
import { getAuthHeaders, authenticatedFetch } from '../../utils/api';
import './TicketAssignmentStats.css';

const TicketAssignmentStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rebalancing, setRebalancing] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/tickets/assignment-stats', {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to fetch assignment statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleRebalance = async () => {
    try {
      setRebalancing(true);
      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/tickets/rebalance', {
        method: 'POST',
        headers: headers
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ ${data.message}`);
        fetchStats(); // Refresh stats
      } else {
        alert(` ${data.message}`);
      }
    } catch (err) {
      alert(' Failed to rebalance assignments');
    } finally {
      setRebalancing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="assignment-stats-container">
        <div className="loading">Loading assignment statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="assignment-stats-container">
        <div className="error">Error: {error}</div>
        <button onClick={fetchStats} className="retry-button">Retry</button>
      </div>
    );
  }

  return (
    <div className="assignment-stats-container">
      <div className="stats-header">
        <h2>🎯 Equal Ticket Assignment System</h2>
        <p>Automatic distribution of tickets among all active agents</p>
      </div>

      <div className="stats-summary">
        <div className="summary-card">
          <h3>📊 Overview</h3>
          <div className="summary-stats">
            <div className="stat-item">
              <span className="stat-label">Total Agents:</span>
              <span className="stat-value">{stats.total_agents}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Tickets:</span>
              <span className="stat-value">{stats.total_tickets}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average per Agent:</span>
              <span className="stat-value">{stats.average_tickets_per_agent}</span>
            </div>
          </div>
        </div>

        <div className="rebalance-section">
          <h3>🔄 Rebalance Assignments</h3>
          <p>Automatically redistribute unassigned tickets among agents</p>
          <button 
            onClick={handleRebalance} 
            disabled={rebalancing}
            className="rebalance-button"
          >
            {rebalancing ? 'Rebalancing...' : 'Rebalance Now'}
          </button>
        </div>
      </div>

      <div className="agents-stats">
        <h3>👥 Agent Workload Distribution</h3>
        <div className="agents-grid">
          {stats.agents.map((agent) => (
            <div key={agent.id} className="agent-card">
              <div className="agent-header">
                <h4>{agent.name}</h4>
                <span className={`role-badge ${agent.role}`}>
                  {agent.role.replace('_', ' ')}
                </span>
              </div>
              
              <div className="agent-stats">
                <div className="stat-row">
                  <span className="stat-label">New:</span>
                  <span className="stat-value new">{agent.new_tickets}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">In Progress:</span>
                  <span className="stat-value in-progress">{agent.in_progress_tickets}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label">Closed:</span>
                  <span className="stat-value closed">{agent.closed_tickets}</span>
                </div>
                <div className="stat-row total">
                  <span className="stat-label">Total:</span>
                  <span className="stat-value total">{agent.total_tickets}</span>
                </div>
              </div>

              <div className="agent-details">
                <div className="detail-item">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{agent.email}</span>
                </div>
                {agent.department && (
                  <div className="detail-item">
                    <span className="detail-label">Department:</span>
                    <span className="detail-value">{agent.department}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="system-info">
        <h3>ℹ️ How It Works</h3>
        <div className="info-grid">
          <div className="info-card">
            <h4>🎯 Equal Distribution</h4>
            <p>New tickets are automatically assigned to the agent with the least number of active tickets.</p>
          </div>
          <div className="info-card">
            <h4>⚖️ Fair Workload</h4>
            <p>Ensures all agents have a balanced workload and no single agent is overwhelmed.</p>
          </div>
          <div className="info-card">
            <h4>🔄 Auto-Scaling</h4>
            <p>When new agents are added, the system automatically includes them in the distribution.</p>
          </div>
          <div className="info-card">
            <h4>📊 Real-time Stats</h4>
            <p>Monitor workload distribution and rebalance assignments when needed.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketAssignmentStats;
