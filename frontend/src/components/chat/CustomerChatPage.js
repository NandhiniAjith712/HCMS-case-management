import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getAuthHeaders, buildApiUrl, isCustomerSessionValid } from '../../utils/api';
import TicketChat from './TicketChat';
import './CustomerChatPage.css';

const CustomerChatPage = ({ user: propUser }) => {
  const { ticketId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Resolve user: prop, localStorage, or ticket-access API (when e in URL from notification link)
  useEffect(() => {
    let cancelled = false;

    async function resolveUser() {
      if (propUser) {
        if (!cancelled) setUser(propUser);
        return;
      }

      let resolvedUser = null;
      const storedUser = localStorage.getItem('customerData') || localStorage.getItem('userData');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          if (!userData.role || !['support_agent', 'support_manager', 'ceo', 'admin'].includes(userData.role)) {
            resolvedUser = userData;
          }
        } catch (_) {}
      }
      if (!resolvedUser) {
        const userId = localStorage.getItem('customer_id') || localStorage.getItem('user_id');
        const userName = localStorage.getItem('customer_name') || localStorage.getItem('user_name');
        const userEmail = localStorage.getItem('customer_email') || localStorage.getItem('user_email');
        const userRole = localStorage.getItem('customer_role') || localStorage.getItem('user_role');
        if (userId && userName && userEmail) {
          resolvedUser = { id: userId, name: userName, email: userEmail, role: userRole || 'user' };
        }
      }
      if (!resolvedUser) {
        try {
          const legacyUser = localStorage.getItem('tickUser');
          if (legacyUser) resolvedUser = JSON.parse(legacyUser);
        } catch (_) {}
      }
      if (!resolvedUser) {
        const autoLoginContext = localStorage.getItem('autoLoginContext');
        if (autoLoginContext) {
          try {
            const ctx = JSON.parse(autoLoginContext);
            const id = localStorage.getItem('customer_id') || localStorage.getItem('user_id');
            const name = localStorage.getItem('customer_name') || localStorage.getItem('user_name');
            const email = localStorage.getItem('customer_email') || localStorage.getItem('user_email');
            if (id && name && email) resolvedUser = { id, name, email, role: 'user' };
          } catch (_) {}
        }
      }

      if (!resolvedUser && ticketId) {
        const urlEmail = searchParams.get('e') || searchParams.get('user_email');
        if (urlEmail && urlEmail.includes('@')) {
          try {
            const url = buildApiUrl(`/api/auth/ticket-access/${ticketId}?e=${encodeURIComponent(urlEmail)}`);
            const res = await fetch(url);
            const data = await res.json();
            if (!cancelled && data.success && data.data) {
              const { user: u, token } = data.data;
              localStorage.setItem('customerData', JSON.stringify(u));
              localStorage.setItem('customerToken', token);
              localStorage.setItem('customer_id', u.id);
              localStorage.setItem('customer_name', u.name);
              localStorage.setItem('customer_email', u.email);
              localStorage.setItem('customer_role', u.role || 'user');
              resolvedUser = u;
              window.dispatchEvent(new Event('storage'));
            } else if (!cancelled && !data.success) {
              setError(data.message || 'Access denied');
              setLoading(false);
              return;
            }
          } catch (err) {
            if (!cancelled) {
              setError(err.message || 'Could not verify access');
              setLoading(false);
              return;
            }
          }
        }
      }

      if (!cancelled) {
        if (resolvedUser) {
          setUser(resolvedUser);
        } else {
          setError('Authentication required. Please use your support link or sign in.');
          setLoading(false);
        }
      }
    }

    resolveUser();
    return () => { cancelled = true; };
  }, [ticketId, propUser, searchParams]);

  // Fetch ticket when user is set
  useEffect(() => {
    if (!user || !ticketId) return;
    testTokenAndFetchTicket();
  }, [user, ticketId]);

  const testTokenAndFetchTicket = async () => {
    // Fetch the ticket directly (skip token test for now)
    fetchTicket();
  };

  const fetchTicket = async () => {
    try {
      console.log('🔍 Fetching ticket data for ID:', ticketId);
      
      const headers = getAuthHeaders();
      console.log('🔑 Using auth headers for ticket fetch');
      
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'GET',
        headers: headers
      });
      
      console.log('📡 Response status:', response.status);
      
      if (response.status === 401) {
        console.error('❌ Unauthorized - Token might be invalid or missing');
        setError('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }
      
      if (response.status === 404) {
        console.error('❌ Ticket not found');
        setError('Ticket not found');
        setLoading(false);
        return;
      }
      
      const data = await response.json();
      console.log('📋 Response data:', data);
      
      if (data.success) {
        setTicket(data.data);
      } else {
        setError(data.message || 'Ticket not found');
      }
    } catch (error) {
      console.error('❌ Error fetching ticket:', error);
      setError('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    if (isCustomerSessionValid()) {
      navigate('/userdashboard');
    } else {
      navigate('/customer-access?returnTo=/userdashboard');
    }
  };

  if (loading) {
    return (
      <div className="customer-chat-loading">
        <div className="loading-spinner"></div>
        <p>Loading chat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-chat-error">
        <div className="error-icon">❌</div>
        <h3>Error</h3>
        <p>{error}</p>
        <button className="back-btn" onClick={handleBackToDashboard}>
          ← Back to Dashboard
        </button>
        <a href="/customer-access" className="back-btn link-btn" style={{ marginTop: 8, display: 'inline-block' }}>
          Sign in or create password
        </a>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="customer-chat-error">
        <div className="error-icon">❌</div>
        <h3>Ticket Not Found</h3>
        <p>The requested ticket could not be found.</p>
        <button className="back-btn" onClick={handleBackToDashboard}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="customer-chat-page">
      {/* Header */}
      <div className="chat-page-header">
        <div className="header-content">
          <button className="back-button" onClick={handleBackToDashboard}>
            ← Back to Dashboard
          </button>
          <div className="ticket-info">
            <h1>💬 Support Chat - Ticket #{ticket.id}</h1>
          </div>
        </div>
      </div>

      {/* Chat Interface - Using Working TicketChat Component */}
      <div className="chat-interface">
        <TicketChat
          ticket={ticket}
          user={user}
          userType="customer"
          onClose={handleBackToDashboard}
          onReplyAdded={() => {}}
          showChatButton={false}
          awsStyle={true}
        />
      </div>
    </div>
  );
};

export default CustomerChatPage;
