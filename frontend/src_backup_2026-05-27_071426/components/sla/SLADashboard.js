import React, { useState, useEffect } from 'react';
import { getAuthHeaders, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './SLADashboard.css';

const SLADashboard = () => {
  const [activeTimers, setActiveTimers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState('all'); // all, warning, breached, normal

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    fetchActiveTimers();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchActiveTimers, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const fetchActiveTimers = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/sla/timers/active`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setActiveTimers(data.data);
        setError('');
      } else {
        setError(data.message);
      }
    } catch (error) {
      console.error('Error fetching active timers:', error);
      setError('Failed to fetch active timers');
    } finally {
      setLoading(false);
    }
  };

  const handleTimerAction = async (timerId, action) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/sla/timers/${timerId}/${action}`, {
        method: 'PUT',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        fetchActiveTimers();
      } else {
        setError(data.message);
      }
    } catch (error) {
      console.error(`Error ${action} timer:`, error);
      setError(`Failed to ${action} timer`);
    }
  };

  const formatTimeRemaining = (minutes) => {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else {
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor((minutes % 1440) / 60);
      return `${days}d ${hours}h`;
    }
  };

  const getTimerStatusColor = (timer) => {
    if (timer.is_breached) return '#ff4444';
    if (timer.is_warning) return '#ff8800';
    if (timer.is_escalation_needed) return '#ff6600';
    if (timer.is_escalation_warning) return '#ffaa00';
    return '#44aa44';
  };

  const getTimerStatusClass = (timer) => {
    if (timer.is_breached) return 'breached';
    if (timer.is_warning) return 'warning';
    if (timer.is_escalation_needed) return 'escalation-needed';
    if (timer.is_escalation_warning) return 'escalation-warning';
    return 'normal';
  };

  const getEscalationStatusText = (timer) => {
    if (timer.is_escalation_needed) {
      return `🚨 ESCALATION NEEDED - ${timer.escalation_level.toUpperCase()}`;
    }
    if (timer.is_escalation_warning) {
      return `⚠️ Escalation in ${formatTimeRemaining(timer.escalation_remaining_minutes)}`;
    }
    return null;
  };

  const getFilteredTimers = () => {
    switch (filter) {
      case 'warning':
        return activeTimers.filter(timer => timer.is_warning && !timer.is_breached && !timer.is_escalation_needed);
      case 'breached':
        return activeTimers.filter(timer => timer.is_breached);
      case 'escalation':
        return activeTimers.filter(timer => timer.is_escalation_needed || timer.is_escalation_warning);
      case 'normal':
        return activeTimers.filter(timer => !timer.is_warning && !timer.is_breached && !timer.is_escalation_needed && !timer.is_escalation_warning);
      default:
        return activeTimers;
    }
  };

  const getStats = () => {
    const total = activeTimers.length;
    const breached = activeTimers.filter(t => t.is_breached).length;
    const warning = activeTimers.filter(t => t.is_warning && !t.is_breached && !t.is_escalation_needed).length;
    const escalation = activeTimers.filter(t => t.is_escalation_needed || t.is_escalation_warning).length;
    const normal = activeTimers.filter(t => !t.is_warning && !t.is_breached && !t.is_escalation_needed && !t.is_escalation_warning).length;

    return { total, breached, warning, escalation, normal };
  };

  const stats = getStats();
  const filteredTimers = getFilteredTimers();

  return (
    <div className="sla-dashboard">
      <div className="dashboard-header">
        <h2>⏱️ SLA Dashboard</h2>
        <div className="dashboard-controls">
          <button 
            onClick={fetchActiveTimers}
            className="refresh-btn"
            title="Refresh dashboard"
          >
            🔄 Refresh
          </button>
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Active</div>
        </div>
        <div className="stat-card normal">
          <div className="stat-number">{stats.normal}</div>
          <div className="stat-label">On Track</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-number">{stats.warning}</div>
          <div className="stat-label">Warning</div>
        </div>
        <div className="stat-card escalation">
          <div className="stat-number">{stats.escalation}</div>
          <div className="stat-label">Escalation</div>
        </div>
        <div className="stat-card breached">
          <div className="stat-number">{stats.breached}</div>
          <div className="stat-label">Breached</div>
        </div>
      </div>

      <div className="filter-controls">
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({stats.total})
          </button>
          <button 
            className={`filter-btn ${filter === 'normal' ? 'active' : ''}`}
            onClick={() => setFilter('normal')}
          >
            On Track ({stats.normal})
          </button>
          <button 
            className={`filter-btn ${filter === 'warning' ? 'active' : ''}`}
            onClick={() => setFilter('warning')}
          >
            Warning ({stats.warning})
          </button>
          <button 
            className={`filter-btn ${filter === 'escalation' ? 'active' : ''}`}
            onClick={() => setFilter('escalation')}
          >
            Escalation ({stats.escalation})
          </button>
          <button 
            className={`filter-btn ${filter === 'breached' ? 'active' : ''}`}
            onClick={() => setFilter('breached')}
          >
            Breached ({stats.breached})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading SLA dashboard...</div>
      ) : filteredTimers.length === 0 ? (
        <div className="no-timers">
          {filter === 'all' ? 'No active SLA timers found' : `No ${filter} timers found`}
        </div>
      ) : (
        <div className="timers-grid">
          {filteredTimers.map(timer => (
            <div 
              key={timer.id} 
              className={`timer-card ${getTimerStatusClass(timer)}`}
              style={{ borderColor: getTimerStatusColor(timer) }}
            >
              <div className="timer-header">
                <div className="timer-type">
                  {timer.timer_type === 'response' ? '📞 Response' : '✅ Resolution'}
                </div>
              </div>

              <div className="ticket-info">
                <div className="ticket-name">
                  <strong>Ticket:</strong> {timer.ticket_name}
                </div>
                <div className="ticket-status">
                  Status: {timer.ticket_status}
                </div>
              </div>

              <div className="timer-info">
                <div className="issue-name">{timer.issue_name}</div>
                <div className="product-info">
                  {timer.product_name} → {timer.module_name}
                </div>
              </div>

              <div className="time-remaining">
                <div className="time-display">
                  {timer.is_breached ? (
                    <span className="breached-time">
                      ⚠️ Breached by {formatTimeRemaining(Math.abs(timer.remaining_minutes))}
                    </span>
                  ) : (
                    <span className="remaining-time">
                      ⏰ {formatTimeRemaining(timer.remaining_minutes)} remaining
                    </span>
                  )}
                </div>
                
                {/* Escalation Status */}
                {getEscalationStatusText(timer) && (
                  <div className="escalation-status">
                    <span className={`escalation-text ${timer.is_escalation_needed ? 'urgent' : 'warning'}`}>
                      {getEscalationStatusText(timer)}
                    </span>
                  </div>
                )}
                
                <div className="time-details">
                  <div>Deadline: {formatDateTimeIST(timer.deadline)}</div>
                  <div>Limit: {formatTimeRemaining(timer.time_limit_minutes)}</div>
                  {timer.escalation_time_minutes && (
                    <div>Escalation: {formatTimeRemaining(timer.escalation_time_minutes)} before deadline</div>
                  )}
                </div>
              </div>

              <div className="timer-actions">
                {timer.status === 'active' && (
                  <>
                    <button 
                      onClick={() => handleTimerAction(timer.id, 'pause')}
                      className="action-btn pause"
                      title="Pause timer"
                    >
                      ⏸️ Pause
                    </button>
                    <button 
                      onClick={() => handleTimerAction(timer.id, 'complete')}
                      className="action-btn complete"
                      title="Mark as completed"
                    >
                      ✅ Complete
                    </button>
                  </>
                )}
                {timer.status === 'paused' && (
                  <button 
                    onClick={() => handleTimerAction(timer.id, 'resume')}
                    className="action-btn resume"
                    title="Resume timer"
                  >
                    ▶️ Resume
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SLADashboard; 