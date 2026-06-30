import React from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationIcon from './NotificationIcon';

function NotificationItem({ notification, isLast, onMarkAsRead, userRole }) {
  const navigate = useNavigate();

  const handleView = () => {
    if (onMarkAsRead) onMarkAsRead(notification.id);
    if (notification.ticketId) {
      const role = String(userRole || '').toLowerCase();
      if (role === 'department_head') {
        navigate(`/hcms/dept-escalations/${notification.ticketId}`);
      } else if (role === 'system_admin' || role === 'admin') {
        navigate(`/hcms/admin-tickets/${notification.ticketId}`);
      } else {
        navigate(`/hcms/tickets/${notification.ticketId}`);
      }
    }
  };
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '16px 18px',
      borderBottom: isLast ? 'none' : '1px solid #E5E7EB',
      transition: 'background 0.15s ease',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {/* Unread Indicator */}
      {notification.unread && (
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#3B82F6',
          marginRight: 12,
          flexShrink: 0
        }} />
      )}
      {!notification.unread && (
        <div style={{ width: 6, marginRight: 12, flexShrink: 0 }} />
      )}

      {/* Notification Icon */}
      <NotificationIcon type={notification.type} />

      {/* Content Section */}
      <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        {/* Title Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 3
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#0F172A',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
          }}>
            {notification.type === 'ticket_created' && 'New Ticket Created'}
            {notification.type === 'status_updated' && 'Status Updated'}
            {notification.type === 'info_requested' && 'Information Requested'}
            {notification.type === 'ticket_closed' && 'Ticket Closed'}
            {notification.type === 'ticket_assigned' && 'Ticket Assigned'}
            {notification.type === 'new_comment' && 'New Reply'}
            {notification.type === 'sla_alert' && 'SLA Alert'}
            {notification.type === 'manager_alert' && 'Manager Alert'}
          </span>
          <span style={{
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: '#F3F4F6',
            color: '#6B7280',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
          }}>
            {notification.statusBadge}
          </span>
          <span style={{
            fontSize: 12,
            color: '#64748B',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
          }}>
            · {notification.ticket}
          </span>
        </div>

        {/* Description */}
        <p style={{
          fontSize: 12,
          color: '#374151',
          margin: '3px 0',
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
          lineHeight: 1.5
        }}>
          {notification.description}
        </p>

        {/* Metadata */}
        <div style={{
          fontSize: 11,
          color: '#9CA3AF',
          fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
        }}>
          {notification.date} · {notification.time}
        </div>
      </div>

      {/* View Button */}
      <button style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 500,
        color: '#374151',
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        cursor: 'pointer',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        transition: 'all 0.15s ease',
        marginLeft: 12
      }}
      onClick={handleView}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#F9FAFB';
        e.currentTarget.style.borderColor = '#D1D5DB';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'white';
        e.currentTarget.style.borderColor = '#E5E7EB';
      }}
      >
        View
      </button>
    </div>
  );
}

export default NotificationItem;
