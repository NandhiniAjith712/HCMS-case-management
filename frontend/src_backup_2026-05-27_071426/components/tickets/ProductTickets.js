import React, { useState, useEffect } from 'react';
import { formatDateTimeIST } from '../../utils/dateTime';
import './ProductTickets.css';

const ProductTickets = ({ product, onBack }) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  // Fetch tickets for this product
  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get JWT token from localStorage
      const token = localStorage.getItem('userToken');
      console.log('🔑 Using token for API request:', token ? 'Token found' : 'No token');

      const headers = getAuthHeaders();
      const response = await fetch('http://localhost:5000/api/tickets', {
        method: 'GET',
        headers: headers,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Filter tickets for this specific product
          const productTickets = data.data.filter(ticket => ticket.product_id === product.id);
          setTickets(productTickets);
        } else {
          setError('Failed to fetch tickets');
        }
      } else {
        console.error('❌ Failed to fetch tickets:', response.status, response.statusText);
        setError('Failed to fetch tickets');
      }
    } catch (error) {
      console.error('❌ Error fetching tickets:', error);
      setError('Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [product.id]);

  // Get tickets by status
  const getTicketsByStatus = (status) => {
    if (status === 'all') {
      return tickets;
    }
    return tickets.filter(ticket => ticket.status === status);
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return '#ff6b6b';
      case 'in_progress': return '#4ecdc4';
      case 'escalated': return '#ffa726';
      case 'closed': return '#66bb6a';
      default: return '#95a5a6';
    }
  };

  // Get status label
  const getStatusLabel = (status) => {
    switch (status) {
      case 'new': return 'New';
      case 'in_progress': return 'In Progress';
      case 'escalated': return 'Escalated';
      case 'closed': return 'Closed';
      default: return status;
    }
  };

  // Format date
  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  // Tab list for this product
  const tabList = [
    { key: 'all', label: 'All', count: tickets.length },
    { key: 'new', label: 'New', count: getTicketsByStatus('new').length },
    { key: 'in_progress', label: 'In Progress', count: getTicketsByStatus('in_progress').length },
    { key: 'escalated', label: 'Escalated', count: getTicketsByStatus('escalated').length },
    { key: 'closed', label: 'Closed', count: getTicketsByStatus('closed').length }
  ];

  if (loading) {
    return (
      <div className="product-tickets-loading">
        <div className="loading-spinner"></div>
        <p>Loading tickets for {product.name}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="product-tickets-error">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={fetchTickets} className="retry-btn">Retry</button>
      </div>
    );
  }

  return (
    <div className="product-tickets">
      <div className="product-tickets-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Products
        </button>
        <div className="product-info">
          <h1>📦 {product.name}</h1>
          <p>{product.description || 'No description available'}</p>
        </div>
      </div>

      <div className="tickets-stats">
        <div className="stat-card total">
          <h3>Total Tickets</h3>
          <p className="stat-number">{tickets.length}</p>
        </div>
        <div className="stat-card active">
          <h3>Active Tickets</h3>
          <p className="stat-number">
            {tickets.filter(t => t.status !== 'closed').length}
          </p>
        </div>
        <div className="stat-card closed">
          <h3>Closed Tickets</h3>
          <p className="stat-number">
            {tickets.filter(t => t.status === 'closed').length}
          </p>
        </div>
      </div>

      <div className="tickets-container">
        <nav className="tickets-nav">
          {tabList.map(tab => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="tab-badge">{tab.count}</span>
            </button>
          ))}
        </nav>

        <div className="tickets-content">
          {getTicketsByStatus(activeTab).length === 0 ? (
            <div className="no-tickets">
              <h3>No tickets found</h3>
              <p>No {activeTab === 'all' ? '' : activeTab} tickets for this product.</p>
            </div>
          ) : (
            <div className="tickets-list">
              {getTicketsByStatus(activeTab).map(ticket => (
                <div key={ticket.id} className="ticket-card">
                  <div className="ticket-header">
                    <div className="ticket-info">
                      <h3>{ticket.issue_title || 'No Title'}</h3>
                      <span className="ticket-customer">{ticket.name}</span>
                      <span className="ticket-email">{ticket.email}</span>
                    </div>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(ticket.status) }}
                    >
                      {getStatusLabel(ticket.status)}
                    </span>
                  </div>
                  
                  <div className="ticket-body">
                    <div className="ticket-description">
                      <p>{ticket.description}</p>
                    </div>
                    
                    <div className="ticket-details">
                      <div className="detail-row">
                        <span className="detail-label">Created:</span>
                        <span className="detail-value">{formatDate(ticket.created_at)}</span>
                      </div>
                      {ticket.issue_type && (
                        <div className="detail-row">
                          <span className="detail-label">Issue Type:</span>
                          <span className="detail-value">{ticket.issue_type}</span>
                        </div>
                      )}
                      {ticket.mobile && (
                        <div className="detail-row">
                          <span className="detail-label">Mobile:</span>
                          <span className="detail-value">{ticket.mobile}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductTickets; 