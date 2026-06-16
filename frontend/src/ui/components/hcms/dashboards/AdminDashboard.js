import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import HcmsNavBar from '../HcmsNavBar';

function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <HcmsNavBar title="System Admin Dashboard" />
      <div style={{ padding: 24 }}>
        <h2>Welcome, {user?.name || 'Admin'}</h2>
        <p><strong>Role:</strong> {user?.role}</p>
        <p><strong>Department:</strong> {user?.department || '—'}</p>
        <p><strong>Email:</strong> {user?.email}</p>
        <hr style={{ margin: '20px 0' }} />
        <p>This is the system admin dashboard placeholder.</p>
        <p>Manage users, roles, departments, and system-wide settings here.</p>
      </div>
    </div>
  );
}

export default AdminDashboard;
