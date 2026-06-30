import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import HcmsLogin from './components/hcms/HcmsLogin';
import RoleGuard from './components/hcms/RoleGuard';
import HCMSLayout from './components/HCMSLayout';
import DashboardPage from './pages/DashboardPage';
import CreateTicket from './pages/CreateTicket';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';

// HR pages
import HRDashboard from './pages/hr/HRDashboard';
import AllTickets from './pages/hr/AllTickets';
import AssignedToMe from './pages/hr/AssignedToMe';
import Escalations from './pages/hr/Escalations';
import HREmployees from './pages/hr/HREmployees';
import HREmployeeDetail from './pages/hr/HREmployeeDetail';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDepartments from './pages/admin/AdminDepartments';
import AdminRoutingRules from './pages/admin/AdminRoutingRules';
import AdminActivity from './pages/admin/AdminActivity';
import AdminTenantConfig from './pages/admin/AdminTenantConfig';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminRolesPermissions from './pages/admin/AdminRolesPermissions';
import AdminDepartmentDetail from './pages/admin/AdminDepartmentDetail';
import AdminTickets from './pages/admin/AdminTickets';
import AdminAssignedTickets from './pages/admin/AdminAssignedTickets';
import AdminAssignedTicketDetail from './pages/admin/AdminAssignedTicketDetail';
import AdminTicketDetail from './pages/admin/AdminTicketDetail';
import AdminSLAManagement from './pages/admin/AdminSLAManagement';
import AdminEscalationLevels from './pages/admin/AdminEscalationLevels';
import AdminCaseAccessConfig from './pages/admin/AdminCaseAccessConfig';

// Dept Head pages
import DeptDashboard from './pages/dept/DeptDashboard';
import DeptAllTickets from './pages/dept/DeptAllTickets';
import DeptAssignedTickets from './pages/dept/DeptAssignedTickets';
import DeptEscalations from './pages/dept/DeptEscalations';
import DeptTicketDetail from './pages/dept/DeptTicketDetail';
import DeptInvestigations from './pages/dept/DeptInvestigations';
import DeptDecisions from './pages/dept/DeptDecisions';
import DeptReturnedToHR from './pages/dept/DeptReturnedToHR';

// HR Manager pages
import HRManagerDashboard from './pages/hr-manager/HRManagerDashboard';
import HRManagerTickets from './pages/hr-manager/HRManagerTickets';
import HRManagerTicketDetail from './pages/hr-manager/HRManagerTicketDetail';
import HRManagerEscalations from './pages/hr-manager/HRManagerEscalations';
import HRManagerEscalationDetail from './pages/hr-manager/HRManagerEscalationDetail';

// CEO pages
import CEODashboard from './pages/ceo/CEODashboard';
import CEOTickets from './pages/ceo/CEOTickets';
import CEOTicketDetail from './pages/ceo/CEOTicketDetail';
import CEOEscalations from './pages/ceo/CEOEscalations';
import CEOEscalationDetail from './pages/ceo/CEOEscalationDetail';

function RoleDashboard() {
  const { user } = useAuth();
  if (user?.role === 'hr_executive') return <HRDashboard />;
  if (user?.role === 'hr_manager') return <HRManagerDashboard />;
  if (user?.role === 'ceo') return <CEODashboard />;
  return <DashboardPage />;
}

function RoleTickets() {
  const { user } = useAuth();
  if (user?.role === 'hr_executive') return <AllTickets />;
  return <TicketList />;
}

// PrivateRoute wrapper to ensure authentication
function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function HCMSApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<HcmsLogin />} />
        <Route element={<PrivateRoute><HCMSLayout /></PrivateRoute>}>
          <Route path="/dashboard" element={
            <RoleGuard><RoleDashboard /></RoleGuard>
          } />
          <Route path="/dept-dashboard" element={
            <RoleGuard><DeptDashboard /></RoleGuard>
          } />
          <Route path="/dept-tickets" element={
            <RoleGuard><DeptAllTickets /></RoleGuard>
          } />
          <Route path="/dept-assigned-tickets" element={
            <RoleGuard><DeptAssignedTickets /></RoleGuard>
          } />
          <Route path="/dept-assigned-tickets/:id" element={
            <RoleGuard><DeptTicketDetail /></RoleGuard>
          } />
          <Route path="/dept-escalations" element={
            <RoleGuard><DeptEscalations /></RoleGuard>
          } />
          <Route path="/dept-escalations/:id" element={
            <RoleGuard><DeptTicketDetail /></RoleGuard>
          } />
          <Route path="/dept-investigations" element={
            <RoleGuard><DeptInvestigations /></RoleGuard>
          } />
          <Route path="/dept-decisions" element={
            <RoleGuard><DeptDecisions /></RoleGuard>
          } />
          <Route path="/dept-returned" element={
            <RoleGuard><DeptReturnedToHR /></RoleGuard>
          } />
          <Route path="/admin-dashboard" element={
            <RoleGuard><AdminDashboard /></RoleGuard>
          } />
          <Route path="/admin-users" element={
            <RoleGuard><AdminUsers /></RoleGuard>
          } />
          <Route path="/admin-users/:id" element={
            <RoleGuard><AdminUserDetail /></RoleGuard>
          } />
          <Route path="/admin-roles" element={
            <RoleGuard><AdminRolesPermissions /></RoleGuard>
          } />
          <Route path="/admin-departments" element={
            <RoleGuard><AdminDepartments /></RoleGuard>
          } />
          <Route path="/admin-departments/:id" element={
            <RoleGuard><AdminDepartmentDetail /></RoleGuard>
          } />
          <Route path="/admin-sla" element={
            <RoleGuard><AdminSLAManagement /></RoleGuard>
          } />
          <Route path="/admin-escalation-levels" element={
            <RoleGuard><AdminEscalationLevels /></RoleGuard>
          } />
          <Route path="/admin-case-access" element={
            <RoleGuard><AdminCaseAccessConfig /></RoleGuard>
          } />
          <Route path="/admin-routing" element={
            <RoleGuard><AdminRoutingRules /></RoleGuard>
          } />
          <Route path="/admin-activity" element={
            <RoleGuard><AdminActivity /></RoleGuard>
          } />
          <Route path="/admin-tenant" element={
            <RoleGuard><AdminTenantConfig /></RoleGuard>
          } />
          <Route path="/admin-tickets" element={
            <RoleGuard><AdminTickets /></RoleGuard>
          } />
          <Route path="/admin-tickets/:id" element={
            <RoleGuard><AdminTicketDetail /></RoleGuard>
          } />
          <Route path="/admin-assigned-tickets" element={
            <RoleGuard><AdminAssignedTickets /></RoleGuard>
          } />
          <Route path="/admin-assigned-tickets/:id" element={
            <RoleGuard><AdminAssignedTicketDetail /></RoleGuard>
          } />
          <Route path="/tickets" element={
            <RoleGuard><RoleTickets /></RoleGuard>
          } />
          <Route path="/tickets/new" element={
            <RoleGuard><CreateTicket /></RoleGuard>
          } />
          <Route path="/tickets/:id" element={
            <RoleGuard><TicketDetail /></RoleGuard>
          } />
          <Route path="/assigned" element={
            <RoleGuard><AssignedToMe /></RoleGuard>
          } />
          <Route path="/escalations" element={
            <RoleGuard><Escalations /></RoleGuard>
          } />
          <Route path="/employees" element={
            <RoleGuard><HREmployees /></RoleGuard>
          } />
          <Route path="/employees/:id" element={
            <RoleGuard><HREmployeeDetail /></RoleGuard>
          } />
          <Route path="/hr-manager-dashboard" element={
            <RoleGuard><HRManagerDashboard /></RoleGuard>
          } />
          <Route path="/hr-manager-tickets" element={
            <RoleGuard><HRManagerTickets /></RoleGuard>
          } />
          <Route path="/hr-manager-tickets/:id" element={
            <RoleGuard><HRManagerTicketDetail /></RoleGuard>
          } />
          <Route path="/hr-manager-escalations" element={
            <RoleGuard><HRManagerEscalations /></RoleGuard>
          } />
          <Route path="/hr-manager-escalations/:id" element={
            <RoleGuard><HRManagerEscalationDetail /></RoleGuard>
          } />
          <Route path="/ceo-dashboard" element={
            <RoleGuard><CEODashboard /></RoleGuard>
          } />
          <Route path="/ceo-tickets" element={
            <RoleGuard><CEOTickets /></RoleGuard>
          } />
          <Route path="/ceo-tickets/:id" element={
            <RoleGuard><CEOTicketDetail /></RoleGuard>
          } />
          <Route path="/ceo-escalations" element={
            <RoleGuard><CEOEscalations /></RoleGuard>
          } />
          <Route path="/ceo-escalations/:id" element={
            <RoleGuard><CEOEscalationDetail /></RoleGuard>
          } />
          <Route path="/notifications" element={
            <RoleGuard><NotificationsPage /></RoleGuard>
          } />
          <Route path="/settings" element={
            <RoleGuard><ProfilePage /></RoleGuard>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default HCMSApp;
