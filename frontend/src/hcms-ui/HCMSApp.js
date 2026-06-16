import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import HcmsLogin from './components/hcms/HcmsLogin';
import RoleGuard from './components/hcms/RoleGuard';
import HCMSLayout from './components/HCMSLayout';
import EmployeeDashboard from './components/hcms/dashboards/EmployeeDashboard';
import HrDashboard from './components/hcms/dashboards/HrDashboard';
import DeptHeadDashboard from './components/hcms/dashboards/DeptHeadDashboard';
import AdminDashboard from './components/hcms/dashboards/AdminDashboard';
import CreateTicket from './pages/CreateTicket';
import TicketList from './pages/TicketList';
import TicketDetail from './pages/TicketDetail';

function HCMSApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<HcmsLogin />} />
        <Route element={<HCMSLayout />}>
          <Route path="/employee" element={
            <RoleGuard><EmployeeDashboard /></RoleGuard>
          } />
          <Route path="/hr" element={
            <RoleGuard><HrDashboard /></RoleGuard>
          } />
          <Route path="/department-head" element={
            <RoleGuard><DeptHeadDashboard /></RoleGuard>
          } />
          <Route path="/admin" element={
            <RoleGuard><AdminDashboard /></RoleGuard>
          } />
          <Route path="/tickets" element={
            <RoleGuard><TicketList /></RoleGuard>
          } />
          <Route path="/tickets/new" element={
            <RoleGuard><CreateTicket /></RoleGuard>
          } />
          <Route path="/tickets/:id" element={
            <RoleGuard><TicketDetail /></RoleGuard>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default HCMSApp;
