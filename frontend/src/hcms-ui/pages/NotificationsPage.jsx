import React, { useState, useEffect } from 'react';
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead, backfillHRNotifications, backfillManagerNotifications } from '../services/caseApi';
import NotificationTabs from '../components/notifications/NotificationTabs';
import NotificationItem from '../components/notifications/NotificationItem';

function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState('');

  const user = JSON.parse(sessionStorage.getItem('hcmsUser') || localStorage.getItem('hcmsUser') || '{}');
  const canBackfill = user?.role === 'hr_executive' || user?.role === 'system_admin' || user?.role === 'admin' || user?.role === 'department_head';

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getNotifications({ limit: 50 });
      if (result.success) {
        setNotifications(result.data || []);
      } else {
        setError(result.message || 'Failed to load notifications');
      }
    } catch (err) {
      console.error('[NotificationsPage] Failed to load notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      loadNotifications();
    } catch (err) {
      console.error('[NotificationsPage] Failed to mark all as read:', err);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
    } catch (err) {
      console.error('[NotificationsPage] Failed to mark as read:', err);
    }
  };

  const handleBackfill = async () => {
    setBackfillLoading(true);
    setBackfillMessage('');
    try {
      const isManager = user?.role === 'department_head' || user?.role === 'system_admin' || user?.role === 'admin';
      const result = isManager ? await backfillManagerNotifications() : await backfillHRNotifications();
      if (result.success) {
        setBackfillMessage(`${result.created} notifications added. Reloading...`);
        await loadNotifications();
      } else {
        setBackfillMessage(result.message || 'Backfill failed');
      }
    } catch (err) {
      console.error('[NotificationsPage] Backfill failed:', err);
      setBackfillMessage('Backfill failed. Please try again.');
    } finally {
      setBackfillLoading(false);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !n.isRead;
    if (activeTab === 'tickets') return n.ticketId && n.ticketId !== '';
    if (activeTab === 'mentions') return n.type === 'COMMENT_ADDED';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getNotificationType = (type) => {
    const typeMap = {
      'TICKET_CREATED': 'ticket_created',
      'TICKET_ASSIGNED': 'ticket_assigned',
      'STATUS_CHANGED': 'status_updated',
      'COMMENT_ADDED': 'new_comment',
      'SLA_ALERT': 'sla_alert',
      'MANAGER_ALERT': 'manager_alert'
    };
    return typeMap[type] || 'info_requested';
  };

  const getStatusBadge = (type) => {
    const badgeMap = {
      'TICKET_CREATED': 'New',
      'TICKET_ASSIGNED': 'Assigned',
      'STATUS_CHANGED': 'Updated',
      'COMMENT_ADDED': 'Reply',
      'SLA_ALERT': 'SLA',
      'MANAGER_ALERT': 'Alert'
    };
    return badgeMap[type] || 'Info';
  };

  return (
    <div>
      {/* Tabs + Mark all read */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <NotificationTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalCount={notifications.length}
          unreadCount={unreadCount}
          ticketCount={notifications.filter(n => n.type !== 'new_comment').length}
          mentionCount={notifications.filter(n => n.type === 'new_comment').length}
        />
        <button
          onClick={handleMarkAllRead}
          style={{
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 500,
            color: '#374151',
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
        >
          Mark all as read
        </button>
      </div>

      {/* Notifications Container */}
      <div style={{
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        marginTop: '18px',
        overflow: 'hidden'
      }}>
        {/* Header Row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          borderBottom: '1px solid #E5E7EB',
          background: '#F9FAFB'
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#64748B',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
          }}>
            Recent
          </span>
          <span style={{
            fontSize: 12,
            color: '#64748B',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
          }}>
            {filteredNotifications.length} notifications
          </span>
        </div>

        {/* Notification List */}
        {loading ? (
          <div style={{
            padding: '36px',
            textAlign: 'center',
            color: '#64748B',
            fontSize: 13
          }}>
            Loading notifications...
          </div>
        ) : error ? (
          <div style={{
            padding: '36px',
            textAlign: 'center',
            color: '#DC2626',
            fontSize: 13
          }}>
            {error}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{
            padding: '36px',
            textAlign: 'center',
            color: '#64748B',
            fontSize: 13
          }}>
            <div>No notifications found</div>
            {canBackfill && (
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={handleBackfill}
                  disabled={backfillLoading}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#2563EB',
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: 8,
                    cursor: backfillLoading ? 'not-allowed' : 'pointer',
                    fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                    opacity: backfillLoading ? 0.7 : 1
                  }}
                >
                  {backfillLoading ? 'Loading historical notifications...' : (user?.role === 'department_head' || user?.role === 'system_admin' || user?.role === 'admin' ? 'Load historical notifications' : 'Load historical HR notifications')}
                </button>
                {backfillMessage && (
                  <div style={{ marginTop: 8, fontSize: 12, color: backfillMessage.includes('failed') ? '#DC2626' : '#059669' }}>
                    {backfillMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          filteredNotifications.map((notification, index) => (
            <NotificationItem
              key={notification.id}
              notification={{
                id: notification.id,
                type: getNotificationType(notification.type),
                statusBadge: getStatusBadge(notification.type),
                ticket: notification.ticketId ? `#${notification.ticketId}` : '',
                ticketId: notification.ticketId,
                description: notification.description || notification.title || '',
                date: notification.createdAt ? new Date(notification.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
                time: notification.createdAt ? new Date(notification.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
                unread: !notification.isRead
              }}
              isLast={index === filteredNotifications.length - 1}
              onMarkAsRead={handleMarkAsRead}
              userRole={user?.role}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default NotificationsPage;
