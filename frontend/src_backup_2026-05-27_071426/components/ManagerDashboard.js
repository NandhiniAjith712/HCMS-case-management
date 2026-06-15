import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTimeIST } from '../utils/dateTime';
import './dashboards/ManagerDashboard.css';
import SLATimer from './sla/SLATimer';
import TicketCard from './tickets/TicketCard';

const ManagerDashboard = ({ manager }) => {
  const navigate = useNavigate();
  
  // SECURITY CHECK: Ensure only managers can access this dashboard
  useEffect(() => {
    console.log('🔒 ManagerDashboard: Checking user role...');
    console.log('👤 Manager prop:', manager);
    
    // Check if user is actually a manager (support_manager)
    if (!manager || manager.role !== 'support_manager') {
      console.log('❌ Access denied - User is not a manager:', manager?.role);
      console.log('🔄 Redirecting to login...');
      navigate('/login', { replace: true });
      return;
    }
    
    console.log('✅ ManagerDashboard: Access granted for manager:', manager.name);
  }, [manager, navigate]);
  const [tickets, setTickets] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('overview');
  const [openMediaId, setOpenMediaId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketReplies, setTicketReplies] = useState({});
  
  // Reply functionality state
  const [replyText, setReplyText] = useState('');
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [selectedTicketForReply, setSelectedTicketForReply] = useState(null);
  
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalTickets: 0,
    resolvedTickets: 0,
    avgResolutionTime: 0,
    teamPerformance: []
  });

  // Fetch tickets and team data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch tickets
      const ticketsResponse = await fetch('http://localhost:5000/api/tickets');
      let ticketsData = [];
      if (ticketsResponse.ok) {
        const result = await ticketsResponse.json();
        ticketsData = result.data;
        setTickets(ticketsData);
      }

      // Fetch team members (support executives) from agents table
      const teamResponse = await fetch('http://localhost:5000/api/agents');
      if (teamResponse.ok) {
        const teamData = await teamResponse.json();
        const teamMembersData = teamData.data || [];
        setTeamMembers(teamMembersData);
        
        // Calculate performance metrics with the fetched data
        calculatePerformanceMetrics(ticketsData, teamMembersData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePerformanceMetrics = (ticketsData, teamMembersData) => {
    const totalTickets = ticketsData.length;
    const resolvedTickets = ticketsData.filter(t => t.status === 'closed').length;
    const avgResolutionTime = totalTickets > 0 ? 
      ticketsData.reduce((acc, ticket) => {
        if (ticket.resolution_time) acc += ticket.resolution_time;
        return acc;
      }, 0) / totalTickets : 0;

    // Filter for support executives only (exclude CEO, Manager, Admin)
    const supportExecutives = teamMembersData.filter(member => 
      member.role === 'support_agent' || 
      member.role === 'Support Executive' ||
      member.role === 'support_agent'
    );

    setPerformanceMetrics({
      totalTickets,
      resolvedTickets,
      avgResolutionTime: Math.round(avgResolutionTime),
      teamPerformance: supportExecutives.map(member => ({
        ...member,
        assignedTickets: ticketsData.filter(t => t.assigned_to === member.id).length,
        resolvedTickets: ticketsData.filter(t => t.assigned_to === member.id && t.status === 'closed').length
      }))
    });
  };

  // Function to recalculate metrics when tickets change
  const recalculateMetrics = () => {
    if (tickets.length > 0 && teamMembers.length > 0) {
      calculatePerformanceMetrics(tickets, teamMembers);
    }
  };

  useEffect(() => {
    fetchData();
    fetchProducts();
  }, []);

  // Fetch ticket replies when tickets are loaded
  useEffect(() => {
    if (tickets.length > 0) {
      tickets.forEach(ticket => {
        fetchTicketReplies(ticket.id);
      });
    }
  }, [tickets]);

  // Refresh data when analytics tab is selected
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchData();
    }
  }, [activeTab]);

  // Recalculate metrics whenever tickets change
  useEffect(() => {
    if (tickets.length > 0 && teamMembers.length > 0) {
      recalculateMetrics();
    }
  }, [tickets, teamMembers]);

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  const handleResolveTicket = async (ticketId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'closed' })
      });

      if (response.ok) {
        setTickets(prev => prev.map(ticket =>
          ticket.id === ticketId ? { ...ticket, status: 'closed' } : ticket
        ));
        console.log('✅ Ticket resolved successfully');
        
        // Recalculate performance metrics after status change
        setTimeout(() => {
          calculatePerformanceMetrics(tickets, teamMembers);
        }, 100);
      }
    } catch (error) {
      console.error('Error resolving ticket:', error);
    }
  };

  // Handle status change for centralized ticket component
  const handleStatusChange = async (ticketId, newStatus) => {
    try {
      const response = await fetch(`http://localhost:5000/api/tickets/${ticketId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('agentToken')}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        setTickets(prev => prev.map(ticket =>
          ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
        ));
        console.log(`✅ Ticket status changed to ${newStatus} successfully`);
        // Refresh data to show updated status
        fetchData();
      } else {
        console.error(`Failed to change ticket status to ${newStatus}`);
      }
    } catch (error) {
      console.error('Error changing ticket status:', error);
    }
  };

  // Reply functionality
  const toggleReplyForm = (ticket = null) => {
    if (ticket) {
      setSelectedTicketForReply(ticket);
      setShowReplyForm(true);
      setReplyText('');
    } else {
      setShowReplyForm(false);
      setSelectedTicketForReply(null);
      setReplyText('');
    }
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim() || !selectedTicketForReply) {
      alert('Please enter a reply message');
      return;
    }

    setSendingReply(true);

    try {
      const payload = {
        ticket_id: selectedTicketForReply.id,
        message: replyText.trim(),
        agent_id: localStorage.getItem('agentData') ? JSON.parse(localStorage.getItem('agentData')).id : null
      };

      const response = await fetch('http://localhost:5000/api/replies/dashboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('agentToken')}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Reply sent successfully:', result);
        
        // Clear reply form
        setReplyText('');
        setShowReplyForm(false);
        setSelectedTicketForReply(null);
        
        // Refresh data
        fetchData();
        
        // Show success message
        alert('Reply sent successfully!');
      } else {
        const errorData = await response.json();
        console.error('Failed to send reply:', errorData);
        alert(`Failed to send reply: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert(`Error sending reply: ${error.message}`);
    } finally {
      setSendingReply(false);
    }
  };

  // Fetch products for product names
  const fetchProducts = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/sla/products');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setProducts(result.data);
        }
      } else {
        console.error('Failed to fetch products');
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  // Function to get product name by ID
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'N/A';
  };

  const getTicketsByStatus = (status) => tickets.filter(ticket => ticket.status === status);

  // Function to open ticket in new window
  const openTicketWindow = (ticket) => {
    const ticketUrl = `/ticket/${ticket.id}`;
    window.open(ticketUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
  };

  // Reply functionality - Removed from dashboard, now only available in ticket detail view
  // Reply functionality has been moved to TicketDetailPage component


  // Chat helper functions
  const fetchTicketReplies = async (ticketId) => {
    try {
      const response = await fetch(`http://localhost:5000/api/chat/messages/${ticketId}`);
      const data = await response.json();
      
      if (data.success) {
        setTicketReplies(prev => ({
          ...prev,
          [ticketId]: data.data
        }));
      }
    } catch (error) {
      console.error('Error fetching ticket replies:', error);
    }
  };

  const hasCustomerReplies = (ticketId) => {
    const replies = ticketReplies[ticketId] || [];
    return replies.some(reply => reply.sender_type === 'customer');
  };

  const getCustomerReplyCount = (ticketId) => {
    const replies = ticketReplies[ticketId] || [];
    return replies.filter(reply => reply.sender_type === 'customer').length;
  };

  const getLatestCustomerReplyTime = (ticketId) => {
    const replies = ticketReplies[ticketId] || [];
    const customerReplies = replies.filter(reply => reply.sender_type === 'customer');
    if (customerReplies.length === 0) return null;
    
    const latestReply = customerReplies.reduce((latest, current) => 
      new Date(current.created_at) > new Date(latest.created_at) ? current : latest
    );
    
    return new Date(latestReply.created_at);
  };

  const tabList = [
    { key: 'overview', label: 'Overview', count: 0 },
    { key: 'analytics', label: 'Analytics', count: 0 },
    { key: 'team', label: 'Team Performance', count: teamMembers.length },
    { key: 'escalated', label: 'Escalated', count: getTicketsByStatus('escalated').length },
    { key: 'closed', label: 'Closed Tickets', count: getTicketsByStatus('closed').length },
    { key: 'reports', label: 'Reports', count: 0 }
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading manager dashboard...</p>
      </div>
    );
  }

  return (
    <div className="manager-dashboard sidepanel-layout">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Support Manager Dashboard</h1>
          <div className="header-actions">
            <a href="/" className="user-form-link">User Form</a>
          </div>
        </div>
      </header>

      <div className="sidepanel-main">
        <nav className="sidepanel-nav">
          {tabList.map(tab => (
            <button
              key={tab.key}
              className={`sidepanel-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count > 0 && <span className="tab-badge">{tab.count}</span>}
            </button>
          ))}
        </nav>

        <main className="sidepanel-content">
          {activeTab === 'overview' && (
            <div className="overview-section">
              <div className="metrics-grid">
                <div className="metric-card">
                  <h3>Total Tickets</h3>
                  <div className="metric-value">{performanceMetrics.totalTickets}</div>
                </div>
                <div className="metric-card">
                  <h3>Resolved</h3>
                  <div className="metric-value">{performanceMetrics.resolvedTickets}</div>
                </div>
                <div className="metric-card">
                  <h3>Resolution Rate</h3>
                  <div className="metric-value">
                    {performanceMetrics.totalTickets > 0 
                      ? Math.round((performanceMetrics.resolvedTickets / performanceMetrics.totalTickets) * 100)
                      : 0}%
                  </div>
                </div>
                <div className="metric-card">
                  <h3>Avg Resolution Time</h3>
                  <div className="metric-value">{performanceMetrics.avgResolutionTime}h</div>
                </div>
              </div>

              <div className="recent-tickets">
                <h3>Recent Tickets</h3>
                <div className="ticket-list">
                  {tickets.slice(0, 10).map(ticket => (
                    <div key={ticket.id} className="ticket-item">
                      <div className="ticket-info">
                        <span className="ticket-title">{ticket.issue_title}</span>
                        <span className="ticket-status">{ticket.status}</span>
                      </div>
                      <div className="ticket-meta">
                        <span>By: {ticket.name}</span>
                        <span>{formatDate(ticket.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="analytics-section">
              <div className="analytics-header">
                <h3>📊 Analytics Dashboard</h3>
                <p>Comprehensive insights into team performance and ticket metrics</p>

              </div>
              
              <div className="analytics-grid">

                {/* Key Performance Indicators */}
                <div className="analytics-card kpi-section">
                  <h4>🎯 Key Performance Indicators</h4>
                  <div className="kpi-grid">
                    <div className="kpi-item">
                      <div className="kpi-icon">📈</div>
                      <div className="kpi-content">
                        <div className="kpi-value">{performanceMetrics.totalTickets || 'N/A'}</div>
                        <div className="kpi-label">Total Tickets</div>
                      </div>
                    </div>
                    <div className="kpi-item">
                      <div className="kpi-icon">✅</div>
                      <div className="kpi-content">
                        <div className="kpi-value">{performanceMetrics.resolvedTickets || 'N/A'}</div>
                        <div className="kpi-label">Resolved</div>
                      </div>
                    </div>
                    <div className="kpi-item">
                      <div className="kpi-icon">⏱️</div>
                      <div className="kpi-content">
                        <div className="kpi-value">{performanceMetrics.avgResolutionTime || 0}h</div>
                        <div className="kpi-label">Avg Resolution</div>
                      </div>
                    </div>
                    <div className="kpi-item">
                      <div className="kpi-icon">🚀</div>
                      <div className="kpi-content">
                        <div className="kpi-value">
                          {performanceMetrics.totalTickets > 0 
                            ? Math.round((performanceMetrics.resolvedTickets / performanceMetrics.totalTickets) * 100)
                            : 0}%
                        </div>
                        <div className="kpi-label">Success Rate</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="analytics-card status-distribution">
                  <h4>📊 Ticket Status Distribution</h4>
                  <div className="status-chart">
                    <div className="status-bar">
                      <div className="status-label">New</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill new"
                          style={{ width: `${(getTicketsByStatus('new').length / performanceMetrics.totalTickets) * 100}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('new').length}</div>
                    </div>
                    <div className="status-bar">
                      <div className="status-label">In Progress</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill in-progress"
                          style={{ width: `${(getTicketsByStatus('in_progress').length / performanceMetrics.totalTickets) * 100}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('in_progress').length}</div>
                    </div>
                    <div className="status-bar">
                      <div className="status-label">Escalated</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill escalated"
                          style={{ width: `${(getTicketsByStatus('escalated').length / performanceMetrics.totalTickets) * 100}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('escalated').length}</div>
                    </div>
                    <div className="status-bar">
                      <div className="status-label">Closed</div>
                      <div className="status-bar-container">
                        <div 
                          className="status-bar-fill closed"
                          style={{ width: `${(getTicketsByStatus('closed').length / performanceMetrics.totalTickets) * 100}%` }}
                        ></div>
                      </div>
                      <div className="status-count">{getTicketsByStatus('closed').length}</div>
                    </div>
                  </div>
                </div>

                {/* Team Performance Chart */}
                <div className="analytics-card team-performance-chart">
                  <h4>👥 Team Performance Overview</h4>
                  <div className="team-chart">
                    {performanceMetrics.teamPerformance && performanceMetrics.teamPerformance.length > 0 ? (
                      performanceMetrics.teamPerformance.map(member => (
                        <div key={member.id} className="team-chart-item">
                          <div className="member-chart-info">
                            <div className="member-name">{member.name}</div>
                            <div className="member-role">{member.role}</div>
                          </div>
                          <div className="performance-bars">
                            <div className="performance-bar">
                              <div className="bar-label">Assigned</div>
                              <div className="bar-container">
                                <div 
                                  className="bar-fill assigned"
                                  style={{ width: `${Math.min((member.assignedTickets / Math.max(...performanceMetrics.teamPerformance.map(m => m.assignedTickets), 1)) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <div className="bar-value">{member.assignedTickets}</div>
                            </div>
                            <div className="performance-bar">
                              <div className="bar-label">Resolved</div>
                              <div className="bar-container">
                                <div 
                                  className="bar-fill resolved"
                                  style={{ width: `${Math.min((member.resolvedTickets / Math.max(...performanceMetrics.teamPerformance.map(m => m.resolvedTickets), 1)) * 100, 100)}%` }}
                                ></div>
                              </div>
                              <div className="bar-value">{member.resolvedTickets}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="no-team-data">
                        <p>No team performance data available</p>
                        <p>Team Performance Array: {JSON.stringify(performanceMetrics.teamPerformance)}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="analytics-card recent-activity">
                  <h4>🕒 Recent Activity</h4>
                  <div className="activity-list">
                    {tickets.slice(0, 8).map(ticket => (
                      <div key={ticket.id} className="activity-item">
                        <div className="activity-icon">
                          {ticket.status === 'new' && '🆕'}
                          {ticket.status === 'in_progress' && '⏳'}
                          {ticket.status === 'escalated' && '🚨'}
                          {ticket.status === 'closed' && '✅'}
                        </div>
                        <div className="activity-content">
                          <div className="activity-title">Ticket #{ticket.id}</div>
                          <div className="activity-details">
                            {ticket.issue_title || 'No Title'} • {ticket.name}
                          </div>
                          <div className="activity-time">{formatDate(ticket.created_at)}</div>
                        </div>
                        <div className="activity-status">
                          <span className={`status-badge ${ticket.status}`}>
                            {ticket.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="team-section">
              <h3>Team Performance</h3>
              <div className="team-grid">
                {performanceMetrics.teamPerformance.map(member => (
                  <div key={member.id} className="team-member-card">
                    <div className="member-info">
                      <h4>{member.name}</h4>
                      <p>{member.email}</p>
                    </div>
                    <div className="member-stats">
                      <div className="stat">
                        <span className="stat-label">Assigned</span>
                        <span className="stat-value">{member.assignedTickets}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Resolved</span>
                        <span className="stat-value">{member.resolvedTickets}</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Success Rate</span>
                        <span className="stat-value">
                          {member.assignedTickets > 0 
                            ? Math.round((member.resolvedTickets / member.assignedTickets) * 100)
                            : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'escalated' && (
            <div className="escalated-tickets-section">
              <div className="escalated-header">
                <span className="escalated-count">
                  {getTicketsByStatus('escalated').length} escalated tickets found
                </span>
              </div>
              
              {getTicketsByStatus('escalated').length === 0 ? (
                <div className="no-escalated-tickets">
                  <p>No escalated tickets found</p>
                </div>
              ) : (
                <div className="escalated-table-container">
                  <table className="escalated-table">
                    <thead>
                      <tr className="table-header">
                        <th className="header-cell">TICKET NO</th>
                        <th className="header-cell">ISSUE NAME</th>
                        <th className="header-cell">PRODUCT</th>
                        <th className="header-cell">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getTicketsByStatus('escalated').map(ticket => (
                        <tr key={ticket.id} className="table-row">
                          <td className="table-cell ticket-no">#{ticket.id}</td>
                          <td className="table-cell issue-name">{ticket.issue_title || 'No Title'}</td>
                          <td className="table-cell product">
                            <span className="product-badge">
                              {getProductName(ticket.product_id)}
                            </span>
                          </td>
                          <td className="table-cell actions">
                            <button 
                              className="action-btn"
                              onClick={() => openTicketWindow(ticket)}
                              title="Open Ticket Details"
                            >
                              +
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'closed' && (
            <div className="closed-tickets-section">
              <div className="closed-header">
                <span className="closed-count">
                  {getTicketsByStatus('closed').length} closed tickets found
                </span>
              </div>
              
              {getTicketsByStatus('closed').length === 0 ? (
                <div className="no-closed-tickets">
                  <p>No closed tickets found</p>
                </div>
              ) : (
                <div className="closed-table-container">
                  <table className="closed-table">
                    <thead>
                      <tr className="table-header">
                        <th className="header-cell">TICKET NO</th>
                        <th className="header-cell">ISSUE NAME</th>
                        <th className="header-cell">PRODUCT</th>
                        <th className="header-cell">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getTicketsByStatus('closed').map(ticket => (
                        <tr key={ticket.id} className="table-row">
                          <td className="table-cell ticket-no">#{ticket.id}</td>
                          <td className="table-cell issue-name">{ticket.issue_title || 'No Title'}</td>
                          <td className="table-cell product">
                            <span className="product-badge">
                              {getProductName(ticket.product_id)}
                            </span>
                          </td>
                          <td className="table-cell actions">
                            <button 
                              className="action-btn"
                              onClick={() => openTicketWindow(ticket)}
                              title="Open Ticket Details"
                            >
                              +
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="reports-section">
              <h3>Performance Reports</h3>
              <div className="report-cards">
                <div className="report-card">
                  <h4>Monthly Summary</h4>
                  <div className="report-content">
                    <p>Total Tickets: {performanceMetrics.totalTickets}</p>
                    <p>Resolved: {performanceMetrics.resolvedTickets}</p>
                    <p>Pending: {performanceMetrics.totalTickets - performanceMetrics.resolvedTickets}</p>
                    <p>Average Resolution Time: {performanceMetrics.avgResolutionTime} hours</p>
                  </div>
                </div>
                
                <div className="report-card">
                  <h4>Team Performance</h4>
                  <div className="report-content">
                    {performanceMetrics.teamPerformance.map(member => (
                      <div key={member.id} className="member-report">
                        <strong>{member.name}</strong>
                        <span>Assigned: {member.assignedTickets}</span>
                        <span>Resolved: {member.resolvedTickets}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Reply Form Modal */}
      {showReplyForm && selectedTicketForReply && (
        <div className="reply-modal-overlay">
          <div className="reply-modal">
            <div className="reply-modal-header">
              <h3>💬 Quick Reply to Ticket #{selectedTicketForReply.id}</h3>
              <button 
                className="close-reply-btn"
                onClick={() => toggleReplyForm()}
              >
                ✕
              </button>
            </div>
            
            <div className="reply-modal-content">
              <div className="ticket-info">
                <p><strong>Customer:</strong> {selectedTicketForReply.name}</p>
                <p><strong>Issue:</strong> {selectedTicketForReply.issue_title || 'No Title'}</p>
              </div>
              
              <div className="reply-form">
                <label htmlFor="reply-textarea">Your Reply:</label>
                <textarea
                  id="reply-textarea"
                  className="reply-textarea"
                  placeholder="Type your reply message here..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows="4"
                />
                
                <div className="reply-actions">
                  <button
                    className="reply-send-btn"
                    onClick={handleReplySubmit}
                    disabled={sendingReply || !replyText.trim()}
                  >
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                  <button
                    className="reply-cancel-btn"
                    onClick={() => toggleReplyForm()}
                    disabled={sendingReply}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerDashboard; 
