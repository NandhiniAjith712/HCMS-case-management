import React from 'react';

const icons = {
  ticket_created: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
    </svg>
  ),
  status_updated: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  ),
  info_requested: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
  ticket_closed: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  ticket_assigned: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  sla_alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  manager_alert: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
};

const iconConfig = {
  ticket_created: {
    icon: icons.ticket_created,
    background: '#DBEAFE',
    color: '#2563EB'
  },
  status_updated: {
    icon: icons.status_updated,
    background: '#FEF3C7',
    color: '#D97706'
  },
  info_requested: {
    icon: icons.info_requested,
    background: '#DBEAFE',
    color: '#2563EB'
  },
  ticket_closed: {
    icon: icons.ticket_closed,
    background: '#D1FAE5',
    color: '#059669'
  },
  ticket_assigned: {
    icon: icons.ticket_assigned,
    background: '#DBEAFE',
    color: '#2563EB'
  },
  new_comment: {
    icon: icons.new_comment,
    background: '#DBEAFE',
    color: '#2563EB'
  },
  sla_alert: {
    icon: icons.sla_alert,
    background: '#FEE2E2',
    color: '#DC2626'
  },
  manager_alert: {
    icon: icons.manager_alert,
    background: '#FEE2E2',
    color: '#DC2626'
  }
};

function NotificationIcon({ type }) {
  const config = iconConfig[type] || iconConfig.info_requested;

  return (
    <div style={{
      width: 40,
      height: 40,
      borderRadius: 10,
      background: config.background,
      color: config.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      {config.icon}
    </div>
  );
}

export default NotificationIcon;
