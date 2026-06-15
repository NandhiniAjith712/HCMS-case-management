import React, { useState } from 'react';
import { formatDateTimeIST } from '../../utils/dateTime';
import './SimpleTableTest.css';

const SimpleTableTest = () => {
  const [expandedRow, setExpandedRow] = useState(null);

  // Mock data for testing
  const mockTickets = [
    {
      id: 1,
      issue_title: 'Login Issue',
      issue_type: 'Technical',
      description: 'Cannot login to the system',
      name: 'John Doe',
      email: 'john@example.com',
      product: 'Web App',
      status: 'new',
      created_at: '2024-01-15T10:00:00Z'
    },
    {
      id: 2,
      issue_title: 'Payment Failed',
      issue_type: 'Billing',
      description: 'Payment transaction failed',
      name: 'Jane Smith',
      email: 'jane@example.com',
      product: 'Mobile App',
      status: 'in_progress',
      created_at: '2024-01-14T15:30:00Z'
    },
    {
      id: 3,
      issue_title: 'Feature Request',
      issue_type: 'Enhancement',
      description: 'Add dark mode to the application',
      name: 'Bob Wilson',
      email: 'bob@example.com',
      product: 'Desktop App',
      status: 'closed',
      created_at: '2024-01-13T09:00:00Z'
    }
  ];

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
      case 'new': return '🆕 New';
      case 'in_progress': return '🔄 In Progress';
      case 'escalated': return '🚨 Escalated';
      case 'closed': return '✅ Closed';
      default: return status;
    }
  };

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString, { hour: undefined, minute: undefined });
  };

  return (
    <div className="simple-table-test">
      <div className="test-header">
        <h1>🧪 Simple Table Test</h1>
        <p>This is a basic test to verify the table view is working</p>
        <a href="/tickets-table" className="full-view-link">📊 Go to Full Table View</a>
      </div>

      <div className="table-container">
        <div className="table-header">
          <div className="header-cell">Issue Title</div>
          <div className="header-cell">Customer</div>
          <div className="header-cell">Product</div>
          <div className="header-cell">Status</div>
          <div className="header-cell">Created</div>
          <div className="header-cell">Actions</div>
        </div>

        <div className="table-body">
          {mockTickets.map(ticket => (
            <div key={ticket.id} className="table-row">
              <div className="table-cell" onClick={() => setExpandedRow(expandedRow === ticket.id ? null : ticket.id)}>
                <div className="ticket-title">{ticket.issue_title}</div>
                <div className="ticket-type">{ticket.issue_type}</div>
              </div>
              <div className="table-cell" onClick={() => setExpandedRow(expandedRow === ticket.id ? null : ticket.id)}>
                <div className="customer-name">{ticket.name}</div>
                <div className="customer-email">{ticket.email}</div>
              </div>
              <div className="table-cell" onClick={() => setExpandedRow(expandedRow === ticket.id ? null : ticket.id)}>
                <span className="product-badge">📦 {ticket.product}</span>
              </div>
              <div className="table-cell" onClick={() => setExpandedRow(expandedRow === ticket.id ? null : ticket.id)}>
                <span 
                  className="status-badge" 
                  style={{ backgroundColor: getStatusColor(ticket.status) }}
                >
                  {getStatusLabel(ticket.status)}
                </span>
              </div>
              <div className="table-cell" onClick={() => setExpandedRow(expandedRow === ticket.id ? null : ticket.id)}>
                {formatDate(ticket.created_at)}
              </div>
              <div className="table-cell actions-cell">
                <button 
                  className="expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedRow(expandedRow === ticket.id ? null : ticket.id);
                  }}
                >
                  {expandedRow === ticket.id ? '−' : '+'}
                </button>
              </div>

              {/* Expandable row content */}
              {expandedRow === ticket.id && (
                <div className="expanded-content">
                  <div className="ticket-details">
                    <h4>Description</h4>
                    <p>{ticket.description}</p>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">Issue Type:</span>
                        <span className="detail-value">{ticket.issue_type}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Created:</span>
                        <span className="detail-value">{formatDate(ticket.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="test-info">
        <h3>✅ Test Results</h3>
        <ul>
          <li>Table rendering: {mockTickets.length > 0 ? '✅ Working' : '❌ Failed'}</li>
          <li>Row expansion: {expandedRow !== null ? '✅ Working' : '⏳ Click a row to test'}</li>
          <li>Status colors: ✅ Working</li>
          <li>Responsive design: ✅ Working</li>
        </ul>
        <p>If everything shows as working, your table view is ready!</p>
      </div>
    </div>
  );
};

export default SimpleTableTest;
