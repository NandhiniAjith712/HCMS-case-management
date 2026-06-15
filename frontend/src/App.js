import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { isCustomerSessionValid } from './utils/api';
import GlobalLogin from './components/auth/GlobalLogin';
import CustomerAccessPage from './components/auth/CustomerAccessPage';
import StaffSetPassword from './components/auth/StaffSetPassword';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import SupportEntry from './components/common/SupportEntry';
import AutoLoginTest from './components/common/AutoLoginTest';
import UserDashboard from './components/dashboards/UserDashboard';
import AgentDashboard from './components/dashboards/AgentDashboard';
import ManagerDashboard from './components/dashboards/ManagerDashboard';
import CEODashboard from './components/dashboards/CEODashboard';
import BusinessDashboardAuth from './components/common/BusinessDashboardAuth';
import ProductDashboard from './components/dashboards/ProductDashboard';
import TicketsView from './components/tickets/TicketsView';
import TicketTableView from './components/tickets/TicketTableView';
import TicketViewDemo from './components/common/TicketViewDemo';
import SimpleTableTest from './components/common/SimpleTableTest';
import AuthEntryGate from './components/common/AuthEntryGate';
import TicketDetailPage from './components/tickets/TicketDetailPage';
import GroupTicketPage from './components/tickets/GroupTicketPage';
import LinkedTicketReviewPage from './components/tickets/LinkedTicketReviewPage';
import CustomerChatPage from './components/chat/CustomerChatPage';
import FAQAdminPage from './components/admin/FAQAdminPage';
import ItsmAssistant from './components/assistant/ItsmAssistant';
import FeedbackFormPage from './components/feedback/FeedbackFormPage';
import FeedbackInsightsPage from './components/feedback/FeedbackInsightsPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import { NotificationProvider } from './context/NotificationContext';
import { clearAllAuthStorage, installGlobal401Handler, isStaffSessionValid } from './utils/api';
import './App.css';

function SupportEntryWithKey({ onLogin }) {
  const location = useLocation();
  const emailParam = new URLSearchParams(location.search).get('e');
  return <SupportEntry key={emailParam || 'none'} onLogin={onLogin} />;
}

function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoLoginInProgress, setIsAutoLoginInProgress] = useState(false);

  useEffect(() => {
    // Install strict global 401 handler: any API 401 triggers logout + redirect to /login.
    const uninstall = installGlobal401Handler();
    return () => {
      try { uninstall(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    // Restore staff from sessionStorage - use staffData (not overwritten by customer tab)
    const storedUser = sessionStorage.getItem('staffData') || sessionStorage.getItem('userData');
    if (storedUser && isStaffSessionValid()) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setIsLoading(false);
        return;
      } catch {}
    }
    // Restore customer from localStorage when valid session exists
    if (isCustomerSessionValid()) {
      try {
        const customerData = localStorage.getItem('customerData');
        if (customerData) {
          const userData = JSON.parse(customerData);
          if (userData.role === 'user' || userData.role === 'customer' || !['support_agent', 'support_manager', 'ceo', 'admin'].includes(userData.role || '')) {
            setUser(userData);
          }
        }
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const handleUserLogin = (userObj) => {
    console.log('🔐 App.js: User logged in:', userObj);
    console.log('🔍 User role:', userObj?.role);
    console.log('🔍 User ID:', userObj?.id);
    setUser(userObj);
    setIsAutoLoginInProgress(false);
  };


  const handleLogout = () => {
    clearAllAuthStorage();
    setUser(null);
    setIsAutoLoginInProgress(false);
  };

  // Function to render appropriate dashboard based on user role
  const renderDashboard = () => {
    console.log('🎯 renderDashboard called with user:', user);

    // If regular user is logged in, show user dashboard
    if (user) {
      console.log('✅ User is logged in, role:', user.role);
      
      // Validate user role - ensure only customers or SPOCs can access customer dashboard
      if (user.role && !['user', 'customer', 'org_spoc', 'product_spoc'].includes(user.role)) {
        console.log('❌ Invalid role for customer dashboard:', user.role);
        console.log('🔄 Clearing invalid user data and redirecting to login');
        handleLogout();
        return <Navigate to="/login" replace />;
      }
      
      // Only show customer dashboard for regular users
      return (
        <div>
          <UserDashboard user={user} />
        </div>
      );
    }

    // If no user and auto-login is not in progress, redirect to login page
    if (!isAutoLoginInProgress) {
      return <Navigate to="/login" replace />;
    }

    // If auto-login is in progress, show loading
    return <div className="loading">Auto-login in progress...</div>;
  };

  // UserDashboard guard - support URL, customer login, or valid customer session
  const UserDashboardGuard = ({ children, user: propUser }) => {
    const isAuthorized = (() => {
      if (propUser && ['user', 'customer', 'org_spoc', 'product_spoc'].includes(propUser.role)) return true;
      if (isCustomerSessionValid()) return true;
      return false;
    })();
    if (!isAuthorized) return <Navigate to="/customer-access?returnTo=/userdashboard" replace />;
    return children;
  };

  // Protected Route component for staff dashboards (no auto-login)
  const ProtectedRoute = ({ children }) => {
    console.log('🛡️ ProtectedRoute: isLoading=', isLoading, 'user=', user, 'isAutoLoginInProgress=', isAutoLoginInProgress);
    console.log('🔍 Current URL:', window.location.pathname);
    console.log('👤 User role:', user?.role);
    
    if (isLoading) {
      console.log('⏳ ProtectedRoute: Still loading...');
      return <div className="loading">Loading...</div>;
    }
    
    // For staff routes, no auto-login is allowed - must use global login
    if (!user || !isStaffSessionValid()) {
      console.log('❌ ProtectedRoute: No user found, redirecting to login');
      // Ensure storage is cleared so we don't get stuck in a broken state.
      try { clearAllAuthStorage(); } catch (_) {}
      return <Navigate to="/login" replace />;
    }
    
    // Check if user is a staff member (agent, manager, ceo, admin)
    const isStaffMember = user.role && ['support_agent', 'support_manager', 'ceo', 'admin'].includes(user.role);
    if (!isStaffMember) {
      console.log('❌ ProtectedRoute: User is not a staff member, redirecting to login');
      try { clearAllAuthStorage(); } catch (_) {}
      return <Navigate to="/login" replace />;
    }
    
    console.log('✅ ProtectedRoute: Staff member authenticated, rendering children');
    return children;
  };

  const StaffTicketRoute = () => {
    if (!user) return <Navigate to="/login" replace />;
    if (user.role === 'support_manager' || user.role === 'ceo') {
      return <TicketDetailPage user={user} accessScope={user.role === 'ceo' ? 'ceo' : 'manager'} />;
    }
    if (user.role === 'support_agent' || user.role === 'admin') {
      return <TicketDetailPage user={user} accessScope="agent" />;
    }
    return <Navigate to="/login" replace />;
  };

  return (
    <Router>
      <NotificationProvider>
      <>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<GlobalLogin onLogin={handleUserLogin} />} />
        <Route path="/staff/set-password" element={<StaffSetPassword />} />
        <Route path="/staff/forgot-password" element={<ForgotPassword />} />
        <Route path="/staff/reset-password" element={<ResetPassword />} />
        <Route path="/customer-access" element={<CustomerAccessPage onLogin={handleUserLogin} />} />
        <Route path="/auth-entry" element={<AuthEntryGate />} />
        <Route path="/test-auto-login" element={<AutoLoginTest />} />
        
        {/* Business dashboard - accessible without login */}
        <Route path="/businessdashboard" element={<BusinessDashboardAuth />} />
        
        {/* Root route - always show login first (login page handles session restore redirect) */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        
        {/* User dashboard - only accessible via support URL or after customer login */}
        <Route path="/userdashboard" element={
          <UserDashboardGuard user={user}>
            <UserDashboard user={user} />
          </UserDashboardGuard>
        } />
        
        {/* Customer chat route - accessible from UserDashboard */}
        <Route path="/chat/:ticketId" element={<CustomerChatPage user={user} />} />
        <Route path="/feedback/:ticketId" element={<FeedbackFormPage />} />
        <Route path="/customer/ticket/:ticketId" element={
          <UserDashboardGuard user={user}>
            <TicketDetailPage user={user} accessScope="customer" />
          </UserDashboardGuard>
        } />
        <Route path="/user/ticket/:ticketId" element={
          <UserDashboardGuard user={user}>
            <TicketDetailPage user={user} accessScope="customer" />
          </UserDashboardGuard>
        } />
        
        {/* Protected staff routes - require global login, no auto-login */}
        <Route path="/agentdashboard" element={
          <ProtectedRoute>
            {user && (user.role === 'support_agent' || user.role === 'admin') ? (
              <AgentDashboard agent={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        {/* Redirect old email links (agent-dashboard with hyphen) to correct route */}
        <Route path="/agent-dashboard" element={<Navigate to="/agentdashboard" replace />} />
        <Route path="/manager" element={
          <ProtectedRoute>
            {user && user.role === 'support_manager' ? (
              <ManagerDashboard manager={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/ceo" element={
          <ProtectedRoute>
            {user && user.role === 'ceo' ? (
              <CEODashboard ceo={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/products" element={
          <ProtectedRoute>
            {user && (user.role === 'support_agent' || user.role === 'admin') ? (
              <ProductDashboard variant="agent" />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/manager/products" element={
          <ProtectedRoute>
            {user && user.role === 'support_manager' ? (
              <ProductDashboard variant="manager" />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/manager/knowledge-base" element={
          <ProtectedRoute>
            {user && user.role === 'support_manager' ? (
              <KnowledgeBasePage user={user} accessScope="manager" />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/agent/knowledge-base" element={
          <ProtectedRoute>
            {user && (user.role === 'support_agent' || user.role === 'admin') ? (
              <KnowledgeBasePage user={user} accessScope="agent" />
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/faq-admin" element={<ProtectedRoute>{user && user.role === 'ceo' ? <FAQAdminPage onLogout={handleLogout} /> : <Navigate to="/login" replace />}</ProtectedRoute>} />
        <Route path="/feedback-insights" element={
          <ProtectedRoute>
            {user && ['support_manager', 'ceo', 'admin'].includes(user.role) ? (
              <div style={{ padding: 16 }}>
                <FeedbackInsightsPage />
              </div>
            ) : (
              <Navigate to="/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/business-products" element={<ProductDashboard />} />
        <Route path="/tickets" element={<ProtectedRoute>{user && <TicketsView />}</ProtectedRoute>} />
        <Route path="/business-tickets" element={<TicketsView />} />
        <Route path="/tickets-table" element={<ProtectedRoute>{user && <TicketTableView />}</ProtectedRoute>} />
        <Route path="/ticket-demo" element={<ProtectedRoute>{user && <TicketViewDemo />}</ProtectedRoute>} />
        <Route path="/simple-test" element={<ProtectedRoute>{user && <SimpleTableTest />}</ProtectedRoute>} />
        <Route
          path="/agent/ticket/:ticketId"
          element={
            <ProtectedRoute>
              {user && (user.role === 'support_agent' || user.role === 'admin') ? (
                <TicketDetailPage user={user} accessScope="agent" />
              ) : (
                <Navigate to="/login" replace />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/agent/ticket/:ticketId/linked/:childId/review"
          element={
            <ProtectedRoute>
              {user && (user.role === 'support_agent' || user.role === 'admin') ? (
                <LinkedTicketReviewPage accessScope="agent" />
              ) : (
                <Navigate to="/login" replace />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/ticket/:ticketId/group"
          element={
            <ProtectedRoute>
              {user && user.role === 'support_manager' ? (
                <GroupTicketPage />
              ) : (
                <Navigate to="/login" replace />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/ticket/:ticketId"
          element={
            <ProtectedRoute>
              {user && user.role === 'support_manager' ? (
                <TicketDetailPage user={user} accessScope="manager" />
              ) : (
                <Navigate to="/login" replace />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/ticket/:ticketId/linked/:childId/review"
          element={
            <ProtectedRoute>
              {user && user.role === 'support_manager' ? (
                <LinkedTicketReviewPage accessScope="manager" />
              ) : (
                <Navigate to="/login" replace />
              )}
            </ProtectedRoute>
          }
        />
        <Route path="/ticket/:ticketId" element={<ProtectedRoute><StaffTicketRoute /></ProtectedRoute>} />
        
        {/* Universal Support URL: /{product}?m=&u=&e= - must be before catch-all */}
        <Route path="/:product" element={<SupportEntryWithKey onLogin={handleUserLogin} />} />
        
        {/* Catch all - unknown paths go to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <ItsmAssistant />
      </>
      </NotificationProvider>
    </Router>
  );
}

export default App;
