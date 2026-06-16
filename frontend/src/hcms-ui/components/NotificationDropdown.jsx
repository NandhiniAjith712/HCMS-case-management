import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

function NotificationDropdown() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Mock notifications - in production, fetch from API
  useEffect(() => {
    setNotifications([
      { id: 1, message: 'Case #123 status updated to In Progress', time: '5 min ago', read: false },
      { id: 2, message: 'New comment on Case #456', time: '1 hour ago', read: false },
      { id: 3, message: 'Case #789 assigned to you', time: '2 hours ago', read: true },
    ]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 12px',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <span style={{ fontSize: 18 }}>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            background: '#ef4444',
            color: 'white',
            borderRadius: '50%',
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 600
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 8,
          width: 320,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          maxHeight: 400,
          overflowY: 'auto'
        }}>
          <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
            Notifications ({unreadCount} unread)
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
              No notifications
            </div>
          ) : (
            notifications.map(notification => (
              <div
                key={notification.id}
                style={{
                  padding: 12,
                  borderBottom: '1px solid #f3f4f6',
                  background: notification.read ? 'white' : '#f9fafb',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  // Mark as read and navigate to relevant case
                  setNotifications(prev =>
                    prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
                  );
                }}
              >
                <div style={{ fontSize: 14, marginBottom: 4 }}>{notification.message}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{notification.time}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationDropdown;
