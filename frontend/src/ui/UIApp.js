import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import TicketsView from './components/tickets/TicketsView';
import TicketTableView from './components/tickets/TicketTableView';
import TicketViewDemo from './components/common/TicketViewDemo';
import SimpleTableTest from './components/common/SimpleTableTest';
import AuthEntryGate from './components/common/AuthEntryGate';
import TicketDetailPage from './components/tickets/TicketDetailPage';
import GroupTicketPage from './components/tickets/GroupTicketPage';
import LinkedTicketReviewPage from './components/tickets/LinkedTicketReviewPage';
import CustomerChatPage from './components/chat/CustomerChatPage';
import ItsmAssistant from './components/assistant/ItsmAssistant';
import FeedbackFormPage from './components/feedback/FeedbackFormPage';
import FeedbackInsightsPage from './components/feedback/FeedbackInsightsPage';
import { NotificationProvider } from './context/NotificationContext';
import { clearAllAuthStorage, installGlobal401Handler, isStaffSessionValid } from './utils/api';

function SupportEntryWithKey({ onLogin }) {
  const location = useLocation();
  const emailParam = new URLSearchParams(location.search).get('e');
  return <SupportEntry key={emailParam || 'none'} onLogin={onLogin} />;
}

function UIApp() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoLoginInProgress, setIsAutoLoginInProgress] = useState(false);

  useEffect(() => {
    const uninstall = installGlobal401Handler();
    return () => {
      try { uninstall(); } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const storedUser = sessionStorage.getItem('staffData') || sessionStorage.getItem('userData');
    if (storedUser && isStaffSessionValid()) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setIsLoading(false);
        return;
      } catch {}
    }
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
    setUser(userObj);
    setIsAutoLoginInProgress(false);
  };

  const handleLogout = () => {
    clearAllAuthStorage();
    setUser(null);
    window.location.href = '/ui/login';
  };

  function ProtectedRoute({ children }) {
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <Navigate to="/ui/login" replace />;
    return children;
  }

  function UserDashboardGuard({ children }) {
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <Navigate to="/ui/login" replace />;
    if (user.role === 'user' || user.role === 'customer') return children;
    return <Navigate to="/ui/login" replace />;
  }

  function StaffTicketRoute() {
    if (!user) return <Navigate to="/ui/login" replace />;
    if (user.role === 'support_agent' || user.role === 'admin') {
      return <TicketTableView agent={user} onLogout={handleLogout} />;
    }
    if (user.role === 'support_manager' || user.role === 'ceo') {
      return <TicketTableView manager={user} onLogout={handleLogout} />;
    }
    return <Navigate to="/ui/login" replace />;
  }

  function StaffDashboardRoute() {
    if (!user) return <Navigate to="/ui/login" replace />;
    if (user.role === 'support_agent' || user.role === 'admin') {
      return <AgentDashboard agent={user} onLogout={handleLogout} />;
    }
    if (user.role === 'support_manager') {
      return <ManagerDashboard manager={user} onLogout={handleLogout} />;
    }
    if (user.role === 'ceo') {
      return <CEODashboard ceo={user} onLogout={handleLogout} />;
    }
    return <Navigate to="/ui/login" replace />;
  }

  function StaffTicketDetailRoute() {
    if (!user) return <Navigate to="/ui/login" replace />;
    if (user.role === 'support_manager' || user.role === 'ceo') {
      return <TicketDetailPage user={user} accessScope={user.role === 'ceo' ? 'ceo' : 'manager'} />;
    }
    if (user.role === 'support_agent' || user.role === 'admin') {
      return <TicketDetailPage user={user} accessScope="agent" />;
    }
    return <Navigate to="/ui/login" replace />;
  }

  return (
    <NotificationProvider>
      <Routes>
        <Route path="/login" element={<GlobalLogin onLogin={handleUserLogin} />} />
        <Route path="/staff/set-password" element={<StaffSetPassword />} />
        <Route path="/staff/forgot-password" element={<ForgotPassword />} />
        <Route path="/staff/reset-password" element={<ResetPassword />} />
        <Route path="/customer-access" element={<CustomerAccessPage onLogin={handleUserLogin} />} />
        <Route path="/auth-entry" element={<AuthEntryGate />} />
        <Route path="/test-auto-login" element={<AutoLoginTest />} />
        <Route path="/businessdashboard" element={<BusinessDashboardAuth />} />
        <Route path="/" element={<Navigate to="/ui/login" replace />} />
        <Route path="/userdashboard" element={
          <UserDashboardGuard user={user}>
            <UserDashboard user={user} />
          </UserDashboardGuard>
        } />
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
        <Route path="/agentdashboard" element={
          <ProtectedRoute>
            {user && (user.role === 'support_agent' || user.role === 'admin') ? (
              <AgentDashboard agent={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/ui/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/managerdashboard" element={
          <ProtectedRoute>
            {user && user.role === 'support_manager' ? (
              <ManagerDashboard manager={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/ui/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/ceodashboard" element={
          <ProtectedRoute>
            {user && user.role === 'ceo' ? (
              <CEODashboard ceo={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/ui/login" replace />
            )}
          </ProtectedRoute>
        } />
        <Route path="/tickets" element={<ProtectedRoute><StaffTicketRoute /></ProtectedRoute>} />
        <Route path="/tickets/:status" element={<ProtectedRoute><StaffTicketRoute /></ProtectedRoute>} />
        <Route path="/ticket/:ticketId" element={<ProtectedRoute><StaffTicketDetailRoute /></ProtectedRoute>} />
        <Route path="/:product" element={<SupportEntryWithKey onLogin={handleUserLogin} />} />
        <Route path="*" element={<Navigate to="/ui/login" replace />} />
      </Routes>
      <ItsmAssistant />
    </NotificationProvider>
  );
}

export default UIApp;
