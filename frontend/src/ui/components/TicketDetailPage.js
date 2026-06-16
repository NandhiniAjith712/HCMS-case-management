import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDateTimeIST, formatTimeIST } from '../utils/dateTime';
import './tickets/TicketDetailPage.css';
import TicketChat from './chat/TicketChat';

const TicketDetailPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // SLA Timer state
  const [slaConfigurations, setSlaConfigurations] = useState({});
  const [slaConfigsLoading, setSlaConfigsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  // Server-backed SLA timer (fallback if local matching fails)
  const [serverTimer, setServerTimer] = useState(null);
  const [serverTimerLoading, setServerTimerLoading] = useState(false);
  const [serverTimerError, setServerTimerError] = useState('');
  
  // Attachment modal state
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  
  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails();
    }
  }, [ticketId]);

  // Real-time timer updates every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch SLA configurations when component mounts
  useEffect(() => {
    fetchSLAConfigurations();
  }, []);

  // Fetch server-side SLA timer whenever ticketId changes or ticket loads
  useEffect(() => {
    if (ticketId) {
      fetchServerTimer();
    }
  }, [ticketId]);

  // Fetch SLA configurations for timer calculations
  const fetchSLAConfigurations = async () => {
    try {
      const response = await fetch('/api/sla/configurations');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Create a lookup map for quick access
          const configMap = {};
          result.data.forEach(config => {
            const key = `${config.product_id}_${config.module_id}_${config.issue_name}`;
            configMap[key] = config;
          });
          
          setSlaConfigurations(configMap);
        } else {
          console.error('❌ Failed to fetch SLA configurations:', result.message);
        }
      } else {
        console.error('❌ Failed to fetch SLA configurations');
      }
    } catch (error) {
      console.error('❌ Error fetching SLA configurations:', error);
    } finally {
      setSlaConfigsLoading(false);
    }
  };

  const fetchServerTimer = async () => {
    try {
      setServerTimerLoading(true);
      setServerTimerError('');
      const response = await fetch(`/api/sla/timers/${ticketId}/remaining`);
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
        setServerTimer(result.data[0]);
      } else {
        setServerTimer(null);
        setServerTimerError(result.message || 'No server timer');
      }
    } catch (e) {
      setServerTimer(null);
      setServerTimerError('Failed to fetch server timer');
    } finally {
      setServerTimerLoading(false);
    }
  };

  // Calculate SLA timer for the ticket
  const calculateSLATimer = () => {
    if (!ticket) {
      console.log('❌ No ticket data available for SLA calculation');
      return null;
    }

    console.log('🔍 Calculating SLA timer for ticket:', {
      id: ticket.id,
      product_id: ticket.product_id,
      module_id: ticket.module_id,
      issue_type: ticket.issue_type,
      product: ticket.product,
      module: ticket.module
    });

    // Check if we have the required data
    if (!ticket.product_id || !ticket.module_id || !ticket.issue_type) {
      console.log('⚠️ Missing required ticket data for SLA calculation');
      console.log('   - product_id:', ticket.product_id);
      console.log('   - module_id:', ticket.module_id);
      console.log('   - issue_type:', ticket.issue_type);
      return null;
    }

    // Try numeric key first - using issue_name from database
    let key = `${ticket.product_id}_${ticket.module_id}_${ticket.issue_type}`;
    let slaConfig = slaConfigurations[key];
    
    console.log('🔍 Looking for SLA config with key:', key);
    console.log('🔍 Available SLA configs:', Object.keys(slaConfigurations));
    
    // If not found, try text-based lookup as fallback
    if (!slaConfig) {
      console.log('🔍 Trying text-based lookup...');
      const textKey = `${ticket.product}_${ticket.module}_${ticket.issue_type}`;
      console.log('🔍 Text-based key:', textKey);
      
      // Find matching config by text values - using issue_name from database
      slaConfig = Object.values(slaConfigurations).find(config => {
        const matches = config.product_name === ticket.product && 
                       config.module_name === ticket.module && 
                       config.issue_name === ticket.issue_type;
        
        console.log('🔍 Checking config:', {
          config_product: config.product_name,
          ticket_product: ticket.product,
          config_module: config.module_name,
          ticket_module: ticket.module,
          config_issue: config.issue_name,
          ticket_issue: ticket.issue_type,
          matches
        });
        
        return matches;
      });
      
      if (slaConfig) {
        key = `${slaConfig.product_id}_${slaConfig.module_id}_${slaConfig.issue_name}`;
        console.log('✅ Found SLA config via text lookup, new key:', key);
      }
    }
    
    if (!slaConfig) {
      console.log('❌ No SLA configuration found for this ticket');
      console.log('💡 This means:');
      console.log('   1. No SLA rules are configured for this product/module/issue combination');
      console.log('   2. The business team needs to set up SLA rules');
      console.log('   3. Or the ticket data doesn\'t match the SLA configuration keys');
      return null;
    }

    console.log('✅ Found SLA configuration:', slaConfig);

    const now = currentTime;
    const ticketCreatedAt = new Date(ticket.created_at);
    // Use response_time_minutes from database (not sla_time_minutes)
    const slaTimeMinutes = slaConfig.response_time_minutes || 480; // Default 8 hours
    const slaDeadline = new Date(ticketCreatedAt.getTime() + (slaTimeMinutes * 60 * 1000));
    
    const remainingMs = slaDeadline.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / (1000 * 60));
    
    const isBreached = remainingMs < 0;
    const isWarning = remainingMinutes <= 30 && remainingMinutes > 0;
    
    const timerData = {
      remainingMinutes,
      isBreached,
      isWarning,
      slaTimeMinutes,
      deadline: slaDeadline,
      priority: slaConfig.priority_level
    };
    
    console.log('✅ SLA timer calculated:', timerData);
    return timerData;
  };

  // Format time for display
  const formatSLATime = (minutes) => {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else {
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      return `${days}d ${hours}h`;
    }
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'P0': return '#dc2626'; // Red
      case 'P1': return '#ea580c'; // Orange
      case 'P2': return '#ca8a04'; // Yellow
      case 'P3': return '#16a34a'; // Green
      default: return '#6b7280'; // Gray
    }
  };

  const fetchTicketDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/${ticketId}`);
      const data = await response.json();
      
      if (data.success) {
        console.log('🔍 Ticket data received:', data.data);
        console.log('🔍 Attachment fields:', {
          attachment_name: data.data.attachment_name,
          attachment_type: data.data.attachment_type,
          attachment: data.data.attachment
        });
        setTicket(data.data);
      } else {
        setError('Failed to fetch ticket details');
      }
    } catch (error) {
      console.error('Error fetching ticket details:', error);
      setError('Failed to fetch ticket details');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'closed' })
      });

      if (response.ok) {
        console.log('✅ Ticket resolved successfully');
        fetchTicketDetails();
      } else {
        console.error('Failed to resolve ticket');
        alert('Failed to resolve ticket. Please try again.');
      }
    } catch (error) {
      console.error('Error resolving ticket:', error);
      alert('Error resolving ticket. Please try again.');
    }
  };

  const handleEscalate = async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'escalated' })
      });

      if (response.ok) {
        console.log('✅ Ticket escalated successfully');
        fetchTicketDetails();
      } else {
        console.error('Failed to escalate ticket');
        alert('Failed to escalate ticket. Please try again.');
      }
    } catch (error) {
      console.error('Error escalating ticket:', error);
      alert('Error escalating ticket. Please try again.');
    }
  };

  const handleReopen = async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'in_progress' })
      });

      if (response.ok) {
        console.log('✅ Ticket reopened successfully');
        fetchTicketDetails();
      } else {
        console.error('Failed to reopen ticket');
        alert('Failed to reopen ticket. Please try again.');
      }
    } catch (error) {
      console.error('Error reopening ticket:', error);
      alert('Error reopening ticket. Please try again.');
    }
  };

  // Assign equally when unassigned
  const handleAssignEqually = async () => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/assign-equally`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const assignedName = (data.data && (data.data.assigned_to_name || data.data.agent_name)) || 'agent';
        try {
          alert(`Assigned to ${assignedName}`);
        } catch (e) {
          // no-op if alert not available
        }
        await fetchTicketDetails();
      } else {
        alert(data.message || 'Failed to assign ticket');
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
      alert('Error assigning ticket');
    }
  };



  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return formatDateTimeIST(dateString);
  };

  if (loading) {
    return (
      <div className="ticket-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading ticket details...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="ticket-detail-error">
        <h2>Error</h2>
        <p>{error || 'Ticket not found'}</p>
        <button onClick={() => navigate(-1)} className="back-btn">Go Back</button>
      </div>
    );
  }

  return (
    <div className="ticket-detail-page">
      {/* Back Button */}
      <div className="back-section">
        <button onClick={() => navigate(-1)} className="back-btn">
          ← Back to Dashboard
        </button>
      </div>

      {/* Main Ticket Card with Three Sections */}
      <div className="ticket-card">
        
        {/* HEADER SECTION - Ticket ID and Date/Time */}
        <div className="ticket-header-section">
          <div className="ticket-id">
            <span className="id-label">Ticket ID:</span>
            <span className="id-value">#{ticketId}</span>
          </div>
          <div className="ticket-timestamp">
            <span className="timestamp-label">Created:</span>
            <span className="timestamp-value">{formatDate(ticket.created_at)}</span>
          </div>
          {/* Close Button */}
          <button 
            className="ticket-close-btn"
            onClick={() => navigate(-1)}
            title="Close ticket and go back"
          >
            ×
          </button>
        </div>

        {/* BODY SECTION - Customer Data and Issue Details */}
        <div className="ticket-body-section">
          {/* Issue Title */}
          <div className="issue-title">
            <h3>{ticket.issue_title || 'Untitled Ticket'}</h3>
          </div>

          {/* Customer Information */}
          <div className="customer-info">
            <div className="customer-name">
              <span className="label">CUSTOMER:</span>
              <span className="value">{ticket.name}</span>
            </div>
            <div className="customer-email">
              <span className="label">EMAIL:</span>
              <span className="value">{ticket.email}</span>
            </div>
          </div>

          {/* Description Section */}
          <div className="issue-description">
            <span className="label">DESCRIPTION:</span>
            <div className="description-text">{ticket.description}</div>
          </div>

          {/* Ticket Details Grid */}
          <div className="ticket-details-grid">
            <div className="detail-item">
              <span className="detail-label">ISSUE TYPE:</span>
              <span className="detail-value">
                {ticket.issue_type === 'Other' && ticket.issue_type_other 
                  ? ticket.issue_type_other 
                  : ticket.issue_type}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">PRODUCT:</span>
              <span className="detail-value product-badge">{ticket.product || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">MODULE:</span>
              <span className="detail-value module-badge">{ticket.module || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">STATUS:</span>
              <span className="detail-value">{ticket.status || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">ASSIGNED AGENT:</span>
              <span className="detail-value">{ticket.assigned_to_name || 'Unassigned'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">LAST UPDATED:</span>
              <span className="detail-value">{formatDate(ticket.updated_at || ticket.created_at)}</span>
            </div>
            
            {/* Attachment Section */}
            {(ticket.attachment_name || ticket.attachment) && (
              <div className="detail-item attachment-section">
                <span className="detail-label">ATTACHMENT:</span>
                <div className="attachment-content">
                  <div className="attachment-info">
                    <span className="attachment-name">📎 {ticket.attachment_name || ticket.attachment || 'File'}</span>
                    <span className="attachment-type">{ticket.attachment_type || 'Unknown type'}</span>
                  </div>
                  <button 
                    className="open-media-btn"
                    onClick={() => setShowAttachmentModal(true)}
                  >
                    📎 Open Media
                  </button>
                </div>
              </div>
            )}
            
            {/* Debug: Show attachment data if available */}
            {ticket.attachment_name || ticket.attachment_type ? (
              <div className="detail-item debug-attachment">
                <span className="detail-label">DEBUG ATTACHMENT:</span>
                <div className="debug-content">
                  <span>Name: {ticket.attachment_name || 'null'}</span>
                  <span>Type: {ticket.attachment_type || 'null'}</span>
                </div>
              </div>
            ) : (
              <div className="detail-item debug-attachment">
                <span className="detail-label">DEBUG ATTACHMENT:</span>
                <div className="debug-content">
                  <span>No attachment data found</span>
                </div>
              </div>
            )}
            
            {/* SLA Timer Card */}
            <div className="detail-item sla-timer-card">
              <span className="detail-label">SLA TIMER:</span>
              <div className="sla-timer-display">
                {slaConfigsLoading || serverTimerLoading ? (
                  <div className="sla-timer-loading">
                    <span className="timer-icon">⏳</span>
                    <span className="timer-text">Loading...</span>
                  </div>
                ) : (() => {
                  // Prefer server timer if available
                  let slaTimer = null;
                  if (serverTimer) {
                    slaTimer = {
                      remainingMinutes: serverTimer.remaining_minutes,
                      isBreached: !!serverTimer.is_breached,
                      isWarning: !!serverTimer.is_warning,
                      slaTimeMinutes: serverTimer.sla_time_minutes,
                      deadline: new Date(serverTimer.deadline),
                      priority: serverTimer.priority_level
                    };
                  } else {
                    slaTimer = calculateSLATimer();
                  }
                  if (!slaTimer) {
                    return (
                      <div className="sla-timer-no-config">
                        <span className="timer-icon">⏰</span>
                        <span className="timer-text">No SLA Config</span>
                        {serverTimerError && <span style={{ marginLeft: 8, color: '#9ca3af' }}>({serverTimerError})</span>}
                      </div>
                    );
                  }

                  const { remainingMinutes, isBreached, isWarning, priority, slaTimeMinutes, deadline } = slaTimer;
                  
                  let statusClass = 'normal';
                  let statusIcon = '⏰';
                  let statusColor = '#10b981';
                  
                  if (isBreached) {
                    statusClass = 'breached';
                    statusIcon = '🚨';
                    statusColor = '#ef4444';
                  } else if (isWarning) {
                    statusClass = 'warning';
                    statusIcon = '⚠️';
                    statusColor = '#f59e0b';
                  }

                  return (
                    <div className={`sla-timer-content ${statusClass}`} style={{ borderColor: statusColor }}>
                      <div className="timer-header">
                        <span className="timer-icon">{statusIcon}</span>
                        <span className="priority-badge" style={{ backgroundColor: getPriorityColor(priority) }}>
                          {priority}
                        </span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="timer-progress-container">
                        <div 
                          className="timer-progress-bar"
                          style={{ 
                            width: `${Math.max(0, Math.min(100, (remainingMinutes / slaTimeMinutes) * 100))}%`,
                            backgroundColor: statusColor
                          }}
                        ></div>
                      </div>
                      
                      <div className="timer-main-info">
                        {isBreached ? (
                          <div className="timer-breached">
                            <span className="breached-text">🚨 OVERDUE</span>
                            <span className="breached-time">{formatSLATime(Math.abs(remainingMinutes))}</span>
                          </div>
                        ) : (
                          <div className="timer-remaining">
                            <span className="remaining-text">Time Remaining</span>
                            <span className="remaining-time">{formatSLATime(remainingMinutes)}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="timer-details">
                        <div className="timer-total">Total: {formatSLATime(slaTimeMinutes)}</div>
                        <div className="timer-deadline">Due: {formatTimeIST(deadline)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>



        {/* FOOTER SECTION - Reply, Chat, and Actions */}
        <div className="ticket-footer-section">
          {/* Footer Actions Row - Action Buttons */}
          <div className="footer-actions-row">
            {/* Action Buttons */}
            <div className="action-buttons">
              <button onClick={handleResolve} className="resolve-btn">
                ✅ Resolve Ticket
              </button>
              <button onClick={handleEscalate} className="escalate-btn">
                🚨 Escalate
              </button>
              {ticket.status === 'closed' && (
                <button onClick={handleReopen} className="reopen-btn">
                  🔄 Reopen Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Room Section - AWS Style Interface - Always Visible */}
      <div className="aws-chat-section">
        <div className="aws-chat-container">
          {/* Chat Header */}
          <div className="aws-chat-header">
            <h3>💬 Support Chat - Ticket #{ticketId}</h3>
          </div>
          
          {/* AWS Style Chat Messages - Using existing TicketChat component */}
          <div className="aws-chat-messages">
            <TicketChat
              ticket={ticket}
              userType="agent"
              onReplyAdded={() => fetchTicketDetails()}
              showReplySection={true}
              showActions={true}
              awsStyle={true} // Pass flag to enable AWS styling
              showChatButton={false} // Don't show chat button, render inline
            />
          </div>
        </div>
      </div>
      
      {/* Attachment Modal */}
      {showAttachmentModal && (
        <div className="attachment-modal-overlay" onClick={() => setShowAttachmentModal(false)}>
          <div className="attachment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attachment-modal-header">
              <h3>📎 {ticket.attachment_name}</h3>
              <button 
                className="close-attachment-modal-btn"
                onClick={() => setShowAttachmentModal(false)}
              >
                ×
              </button>
            </div>
            <div className="attachment-modal-content">
              {ticket.attachment_type && ticket.attachment_type.startsWith('image/') ? (
                <img 
                  src={`/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`}
                  alt={ticket.attachment_name || 'Attachment'}
                  className="attachment-modal-image"
                />
              ) : ticket.attachment_type && ticket.attachment_type === 'application/pdf' ? (
                <iframe
                  src={`/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`}
                  title={ticket.attachment_name || 'Attachment'}
                  className="attachment-modal-pdf"
                  width="100%"
                  height="600"
                />
              ) : (
                <div className="attachment-modal-download">
                  <p>This file type cannot be previewed directly.</p>
                  <a 
                    href={`/api/tickets/${ticket.id}/attachment?cb=${Date.now()}`}
                    download={ticket.attachment_name || 'attachment'}
                    className="download-attachment-btn"
                  >
                    📥 Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetailPage;
