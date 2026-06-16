import React from 'react';
import { useAuth } from '../../../context/AuthContext';

function HrDashboard() {
  const { user } = useAuth();

  return (
    <div style={{ padding: 24 }}>
        <h2>Welcome, {user?.name || 'HR Executive'}</h2>
        <p><strong>Role:</strong> {user?.role}</p>
        <p><strong>Department:</strong> {user?.department || '—'}</p>
        <p><strong>Email:</strong> {user?.email}</p>
        <hr style={{ margin: '20px 0' }} />
        <p>This is the HR executive dashboard placeholder.</p>
        <p>Manage employee records, onboarding, and department assignments here.</p>
    </div>
  );
}

export default HrDashboard;
