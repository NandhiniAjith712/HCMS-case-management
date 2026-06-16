import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import HcmsNavBar from '../HcmsNavBar';

function EmployeeDashboard() {
  const { user, logout } = useAuth();

  return (
    <div>
      <HcmsNavBar title="Employee Dashboard" />
      <div style={{ padding: 24 }}>
        <h2>Welcome, {user?.name || 'Employee'}</h2>
        <p><strong>Role:</strong> {user?.role}</p>
        <p><strong>Department:</strong> {user?.department || '—'}</p>
        <p><strong>Email:</strong> {user?.email}</p>
        <hr style={{ margin: '20px 0' }} />
        <p>This is the employee self-service dashboard placeholder.</p>
        <p>You can view your profile, submit requests, and track tickets here.</p>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
