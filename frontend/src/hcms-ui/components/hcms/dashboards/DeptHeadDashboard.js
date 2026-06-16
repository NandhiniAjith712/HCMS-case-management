import React from 'react';
import { useAuth } from '../../../context/AuthContext';

function DeptHeadDashboard() {
  const { user } = useAuth();

  return (
    <div style={{ padding: 24 }}>
        <h2>Welcome, {user?.name || 'Department Head'}</h2>
        <p><strong>Role:</strong> {user?.role}</p>
        <p><strong>Department:</strong> {user?.department || '—'}</p>
        <p><strong>Email:</strong> {user?.email}</p>
        <hr style={{ margin: '20px 0' }} />
        <p>This is the department head dashboard placeholder.</p>
        <p>Oversee team performance, approve requests, and manage department resources here.</p>
    </div>
  );
}

export default DeptHeadDashboard;
