import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { getAuthHeaders, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './TicketTableView.css';
import TicketChat from '../chat/TicketChat';

const TicketTableView = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const [filteredTickets, setFilteredTickets] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [products, setProducts] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Get product filter from URL
  const productFilter = searchParams.get('product');

  useEffect(() => {
    fetchTickets();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (tickets.length > 0) {
      console.log('🔄 Tickets changed, filtering...');
      filterTickets();
    } else {
      console.log('🔄 No tickets, setting empty filtered tickets');
      setFilteredTickets([]);
    }
  }, [tickets, productFilter]);

  const handleLogout = () => {
    localStorage.removeItem('tickUser');
    localStorage.removeItem('agentData');
    localStorage.removeItem('agentToken');
    navigate('/');
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      // Get JWT token from localStorage
      const token = localStorage.getItem('userToken');
      console.log('🔑 Using token for API request:', token ? 'Token found' : 'No token');
      
      const headers = getAuthHeaders();
      const response = await fetch('/api/tickets', {
        method: 'GET',
        headers: headers
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('📥 API Response:', data);
        if (data.success) {
          console.log('✅ Setting tickets:', data.data);
          setTickets(data.data);
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

  // Using centralized getAuthHeaders from utils/api.js

  const fetchProducts = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/sla/products', {
        method: 'GET',
        headers: headers
      });
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

  // Helper function to get product display name
  const getProductDisplayName = (ticket) => {
    console.log('🔍 Getting product for ticket:', ticket.id, 'product:', ticket.product, 'product_id:', ticket.product_id, 'products loaded:', products.length);
    
    // If ticket has a product string, use it
    if (ticket.product && typeof ticket.product === 'string' && ticket.product.trim()) {
      console.log('✅ Using ticket.product:', ticket.product);
      return ticket.product;
    }
    
    // If ticket has product_id, look up the product name
    if (ticket.product_id && products.length > 0) {
      const productObj = products.find(p => p.id === ticket.product_id);
      console.log('🔍 Looking for product_id:', ticket.product_id, 'found:', productObj);
      if (productObj && productObj.name) {
        console.log('✅ Using product name:', productObj.name);
        return productObj.name;
      }
    }
    
    // Fallback
    console.log('❌ Using fallback: No Product');
    return 'No Product';
  };

  const filterTickets = () => {
    console.log('🔍 Filtering tickets:', tickets.length, 'tickets, productFilter:', productFilter);
    
    if (!productFilter) {
      console.log('✅ No product filter, showing all tickets');
      setFilteredTickets(tickets);
      return;
    }

    const filtered = tickets.filter(ticket => {
      if (ticket.product_id) {
        return true;
      }
      
      if (ticket.product && typeof ticket.product === 'string') {
        const ticketProduct = ticket.product.toLowerCase().trim();
        const filterProduct = productFilter.toLowerCase().trim();
        
        return ticketProduct === filterProduct || 
               ticketProduct.includes(filterProduct) || 
               filterProduct.includes(ticketProduct);
      }
      
      return false;
    });

    console.log('🔍 Filtered tickets:', filtered.length);
    setFilteredTickets(filtered);
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
      case 'new': return '🆕 New';
      case 'in_progress': return '🔄 In Progress';
      case 'escalated': return '🚨 Escalated';
      case 'closed': return '✅ Closed';
      default: return status;
    }
  };

  const handleRowClick = (ticketId) => {
    navigate(`/ticket/${ticketId}`);
  };

  const handleSort = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    if (sortConfig.key === 'created_at') {
      aValue = new Date(aValue);
      bValue = new Date(bValue);
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="ticket-table-loading">
        <div className="loading-spinner"></div>
        <p>Loading tickets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ticket-table-error">
        <h2>❌ Error</h2>
        <p>{error}</p>
        <button onClick={fetchTickets} className="retry-btn">Retry</button>
      </div>
    );
  }

  return (
    <div className="ticket-table-view">
      {console.log('🎨 Rendering with tickets:', tickets.length, 'filteredTickets:', filteredTickets.length)}
      <div className="tickets-header">
        <div className="header-top">
          <h1>🎫 Tickets</h1>
        </div>
        {productFilter && (
          <div className="product-filter-info">
            <span>Filtered by product: <strong>{productFilter}</strong></span>
            <a href="/tickets" className="clear-filter-btn">Clear Filter</a>
          </div>
        )}
        <p>
          {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''} found
          {productFilter && ` for "${productFilter}"`}
        </p>
      </div>

      <div className="tickets-stats">
        <div className="stat-card">
          <h3>📊 Total</h3>
          <p className="stat-number">{filteredTickets.length}</p>
        </div>
        <div className="stat-card">
          <h3>🆕 New</h3>
          <p className="stat-number">{filteredTickets.filter(t => t.status === 'new').length}</p>
        </div>
        <div className="stat-card">
          <h3>🔄 In Progress</h3>
          <p className="stat-number">{filteredTickets.filter(t => t.status === 'in_progress').length}</p>
        </div>
        <div className="stat-card">
          <h3>🚨 Escalated</h3>
          <p className="stat-number">{filteredTickets.filter(t => t.status === 'escalated').length}</p>
        </div>
        <div className="stat-card">
          <h3>✅ Closed</h3>
          <p className="stat-number">{filteredTickets.filter(t => t.status === 'closed').length}</p>
        </div>
      </div>

      <div className="ticket-table-container">
        {filteredTickets.length === 0 ? (
          <div className="no-tickets">
            <h2>📭 No Tickets Found</h2>
            <p>
              {productFilter 
                ? `No tickets found for product "${productFilter}".` 
                : 'No tickets found in the system.'}
            </p>
          </div>
        ) : (
          <div className="ticket-table">
            <div className="table-header">
              <div className="header-cell sortable" onClick={() => handleSort('issue_title')}>
                ISSUE TITLE
              </div>
              <div className="header-cell sortable" onClick={() => handleSort('name')}>
                CUSTOMER
              </div>
              <div className="header-cell sortable" onClick={() => handleSort('product')}>
                PRODUCT
              </div>
              <div className="header-cell sortable" onClick={() => handleSort('organization_name')}>
                ORGANIZATION
              </div>
              <div className="header-cell sortable" onClick={() => handleSort('status')}>
                STATUS
              </div>
              <div className="header-cell sortable" onClick={() => handleSort('created_at')}>
                CREATED
              </div>
              <div className="header-cell">ACTIONS</div>
            </div>

            <div className="table-body">
              {sortedTickets.map(ticket => (
                <div key={ticket.id} className="table-row">
                  <div className="table-cell">
                    {ticket.issue_title || 'No Title'}
                  </div>
                  <div className="table-cell">
                    <div className="customer-info-cell">
                      <div className="customer-name">{ticket.name}</div>
                      <div className="customer-email">{ticket.email}</div>
                    </div>
                  </div>
                  <div className="table-cell">
                    <span className="product-badge" style={{backgroundColor: 'yellow', color: 'black', padding: '5px', fontWeight: 'bold'}}>
                      TEST PRODUCT - {getProductDisplayName(ticket)}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                      {ticket.organization_name || '—'}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${ticket.status}`}>
                      {getStatusLabel(ticket.status)}
                    </span>
                  </div>
                  <div className="table-cell">
                    {formatDate(ticket.created_at)}
                  </div>
                  <div className="table-cell actions-cell">
                    <button 
                      className="expand-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/ticket/${ticket.id}`, { 
                          state: { 
                            from: 'ticket-table-view',
                            returnPath: '/tickets-table',
                            activeTab: 'table',
                            selectedProduct: productFilter
                          } 
                        });
                      }}
                    >
                      View Ticket
                    </button>
                  </div>

                  
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketTableView;
