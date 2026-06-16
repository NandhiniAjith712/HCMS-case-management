import React, { useState } from 'react';
import TicketsView from '../tickets/TicketsView';
import TicketTableView from '../tickets/TicketTableView';
import './TicketViewDemo.css';

const TicketViewDemo = () => {
  const [activeView, setActiveView] = useState('table'); // 'table' or 'cards'

  return (
    <div className="ticket-view-demo">
      <div className="demo-header">
        <h1>🎫 Ticket View Comparison</h1>
        <p>Compare the new table view with the traditional card view</p>
        
        <div className="view-toggle">
          <button 
            className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
            onClick={() => setActiveView('table')}
          >
            📊 Table View (New)
          </button>
          <button 
            className={`toggle-btn ${activeView === 'cards' ? 'active' : ''}`}
            onClick={() => setActiveView('cards')}
          >
            🃏 Card View (Original)
          </button>
        </div>
      </div>

      <div className="demo-content">
        {activeView === 'table' ? (
          <div className="view-container">
            <h2>📊 New Table View (Atlassian Style)</h2>
            <p className="view-description">
              Compact table format with expandable rows. Click on any row to see ticket details and chat.
            </p>
            <TicketTableView />
          </div>
        ) : (
          <div className="view-container">
            <h2>🃏 Original Card View</h2>
            <p className="view-description">
              Traditional card-based layout showing all ticket information at once.
            </p>
            <TicketsView />
          </div>
        )}
      </div>

      <div className="demo-features">
        <div className="feature-section">
          <h3>✨ New Table View Features</h3>
          <ul>
            <li>📋 Compact table format for better overview</li>
            <li>🔽 Expandable rows for detailed information</li>
            <li>📊 Sortable columns (click headers to sort)</li>
            <li>💬 Integrated chat system in expanded view</li>
            <li>📱 Responsive design for mobile devices</li>
            <li>🎨 Modern, clean interface similar to Atlassian</li>
          </ul>
        </div>

        <div className="feature-section">
          <h3>🔄 How to Use</h3>
          <ol>
            <li>Click on any table row to expand and see ticket details</li>
            <li>Use the expand/collapse button (+) to toggle row expansion</li>
            <li>Click column headers to sort tickets by different criteria</li>
            <li>View and respond to conversations in the expanded chat section</li>
            <li>Use the filter options to find specific tickets</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default TicketViewDemo;
