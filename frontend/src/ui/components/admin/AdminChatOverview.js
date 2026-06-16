import React, { useState, useEffect } from 'react';
import { getAuthHeaders, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import TicketChat from './TicketChat';
import './AdminChatOverview.css';

const AdminChatOverview = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [filter, setFilter] = useState('all'); // all, new, in_progress, escalated, closed
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch('/api/tickets', {
        method: 'GET',
        headers: headers
      });
      if (response.ok) {
        const result = await response.json();
        setTickets(result.data);
      } else {
        console.error('Failed to fetch tickets');
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return '#3b82f6';
      case 'in_progress': return '#f59e0b';
      case 'escalated': return '#ef4444';
      case 'closed': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'new': return 'New';
      case 'in_progress': return 'In Progress';
      case 'escalated': return 'Escalated';
      case 'closed': return 'Closed';
      default: return status;
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesFilter = filter === 'all' || ticket.status === filter;
    const matchesSearch = ticket.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.issue_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getTicketStats = () => {
    const stats = {
      total: tickets.length,
      new: tickets.filter(t => t.status === 'new').length,
      in_progress: tickets.filter(t => t.status === 'in_progress').length,
      escalated: tickets.filter(t => t.status === 'escalated').length,
      closed: tickets.filter(t => t.status === 'closed').length
    };
    return stats;
  };

  const stats = getTicketStats();

  return (
    <div className="admin-chat-overview">
      <div className="chat-overview-header">
        <h2>📱 Chat Overview</h2>
        <p>Manage all ticket conversations from one place</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Tickets</div>
        </div>
        <div className="stat-card new">
          <div className="stat-number">{stats.new}</div>
          <div className="stat-label">New</div>
        </div>
        <div className="stat-card in-progress">
          <div className="stat-number">{stats.in_progress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card escalated">
          <div className="stat-number">{stats.escalated}</div>
          <div className="stat-label">Escalated</div>
        </div>
        <div className="stat-card closed">
          <div className="stat-number">{stats.closed}</div>
          <div className="stat-label">Closed</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="filters-section">
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({stats.total})
          </button>
          <button 
            className={`filter-btn ${filter === 'new' ? 'active' : ''}`}
            onClick={() => setFilter('new')}
          >
            New ({stats.new})
          </button>
          <button 
            className={`filter-btn ${filter === 'in_progress' ? 'active' : ''}`}
            onClick={() => setFilter('in_progress')}
          >
            In Progress ({stats.in_progress})
          </button>
          <button 
            className={`filter-btn ${filter === 'escalated' ? 'active' : ''}`}
            onClick={() => setFilter('escalated')}
          >
            Escalated ({stats.escalated})
          </button>
          <button 
            className={`filter-btn ${filter === 'closed' ? 'active' : ''}`}
            onClick={() => setFilter('closed')}
          >
            Closed ({stats.closed})
          </button>
        </div>
        
        <div className="search-section">
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Tickets List */}
      <div className="tickets-list">
        {loading ? (
          <div className="loading-tickets">
            <div className="loading-spinner"></div>
            <p>Loading tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="no-tickets">
            <p>No tickets found matching your criteria.</p>
          </div>
        ) : (
          filteredTickets.map(ticket => (
            <div key={ticket.id} className="ticket-card">
              <div className="ticket-header">
                <div className="ticket-info">
                  <h3 className="ticket-title">{ticket.issue_title}</h3>
                  <div className="ticket-meta">
                    <span className="customer-name">{ticket.name}</span>
                    <span className="separator">•</span>
                    <span className="customer-email">{ticket.email}</span>
                    <span className="separator">•</span>
                    <span className="ticket-date">{formatDate(ticket.created_at)}</span>
                  </div>
                </div>
                <div className="ticket-status">
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(ticket.status) }}
                  >
                    {getStatusLabel(ticket.status)}
                  </span>
                </div>
              </div>
              
              <div className="ticket-body">
                <div className="ticket-details">
                  <div className="detail-row">
                    <span className="detail-label">Issue Type:</span>
                    <span className="detail-value">
                      {ticket.issue_type === 'Other' && ticket.issue_type_other 
                        ? ticket.issue_type_other 
                        : ticket.issue_type}
                    </span>
                  </div>
                  {ticket.product && (
                    <div className="detail-row">
                      <span className="detail-label">Product:</span>
                      <span className="detail-value product-badge">{ticket.product}</span>
                    </div>
                  )}
                  {ticket.module && (
                    <div className="detail-row">
                      <span className="detail-label">Module:</span>
                      <span className="detail-value module-badge">{ticket.module}</span>
                    </div>
                  )}
                </div>
                
                <div className="ticket-description">
                  {ticket.description.length > 100 
                    ? `${ticket.description.substring(0, 100)}...` 
                    : ticket.description}
                </div>
              </div>
              
              <div className="ticket-actions">
                <TicketChat
                  ticket={ticket}
                  user={{ id: 'admin', name: 'Admin' }}
                  userType="agent"
                  onClose={() => setSelectedTicket(null)}
                  onReplyAdded={() => {
                    fetchTickets(); // Refresh tickets
                  }}
                />
                <button 
                  className="view-details-btn"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Ticket Chat */}
      {selectedTicket && (
        <div className="selected-ticket-chat">
          <div className="chat-header">
            <button 
              className="back-btn"
              onClick={() => setSelectedTicket(null)}
            >
              ← Back to List
            </button>
            <h3>Chat for Ticket #{selectedTicket.id}</h3>
          </div>
          <TicketChat
            ticket={selectedTicket}
            user={{ id: 'admin', name: 'Admin' }}
            userType="agent"
            onClose={() => setSelectedTicket(null)}
            onReplyAdded={() => {
              fetchTickets(); // Refresh tickets
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AdminChatOverview; 