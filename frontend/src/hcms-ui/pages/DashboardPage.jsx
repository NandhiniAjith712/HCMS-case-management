import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardData, getNotifications, markAllNotificationsAsRead } from '../services/caseApi';
import {
  Ticket,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  RefreshCw
} from 'lucide-react';

function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [metrics, setMetrics] = useState({ total: 0, open: 0, inProgress: 0, closed: 0 });
  const [recentTickets, setRecentTickets] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
    loadNotifications();
  }, [user?.id]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDashboardData();
      if (result.success) {
        setMetrics(result.metrics || { total: 0, open: 0, inProgress: 0, closed: 0 });
        setRecentTickets(result.recentTickets || []);
      } else {
        setError(result.message || 'Failed to load dashboard data');
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const result = await getNotifications({ limit: 5 });
      if (result.success) {
        setNotifications(result.data || []);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load notifications:', err);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      loadNotifications();
    } catch (err) {
      console.error('[Dashboard] Failed to mark all as read:', err);
    }
  };

  const stats = [
    {
      label: 'TOTAL TICKETS',
      value: metrics.total,
      subtext: 'All tickets',
      icon: Ticket,
      iconBg: '#F1F5F9',
      iconColor: '#64748B'
    },
    {
      label: 'OPEN',
      value: metrics.open,
      subtext: 'Awaiting action',
      icon: AlertCircle,
      iconBg: '#FEF2F2',
      iconColor: '#EF4444'
    },
    {
      label: 'IN PROGRESS',
      value: metrics.inProgress,
      subtext: 'Being worked on',
      icon: Clock,
      iconBg: '#FEFCE8',
      iconColor: '#F59E0B'
    },
    {
      label: 'CLOSED',
      value: metrics.closed,
      subtext: 'Completed',
      icon: CheckCircle2,
      iconBg: '#F0FDF4',
      iconColor: '#22C55E'
    }
  ];

  const getStatusPill = (status) => {
    const configs = {
      open: { bg: '#FEF2F2', text: '#EF4444', label: 'Open', icon: AlertCircle },
      new: { bg: '#FEF2F2', text: '#EF4444', label: 'Open', icon: AlertCircle },
      in_progress: { bg: '#FEFCE8', text: '#F97316', label: 'In Progress', icon: Clock },
      resolved: { bg: '#F0FDF4', text: '#22C55E', label: 'Closed', icon: CheckCircle2 },
      closed: { bg: '#F0FDF4', text: '#22C55E', label: 'Closed', icon: CheckCircle2 },
    };
    const cfg = configs[status] || configs.open;
    const Icon = cfg.icon;
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 26,
        padding: '0 12px',
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.text,
        fontSize: 12,
        fontWeight: 500
      }}>
        <Icon size={12} />
        {cfg.label}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {error && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={loadDashboardData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              background: '#FEF2F2',
              color: '#EF4444',
              border: '1px solid #FECACA',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: '#64748B'
                }}>{s.label}</span>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: s.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={16} color={s.iconColor} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                  {loading ? '—' : s.value}
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>{s.subtext}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lower Section */}
      <div style={{ display: 'flex', gap: 18 }}>
        {/* Recent Tickets */}
        <div style={{ flex: '1', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 3px' }}>Recent tickets</h2>
              <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Latest activity across your queue</p>
            </div>
            <button
              onClick={() => navigate('/hcms/tickets')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 13,
                fontWeight: 600,
                color: '#0F172A',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              View all <ChevronRight size={14} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                {['ID', 'SUBJECT', 'REQUESTER', 'STATUS', 'UPDATED'].map((h, i) => (
                  <th key={i} style={{
                    padding: '12px 18px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: '#64748B',
                    textAlign: 'left',
                    letterSpacing: '0.5px'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading...</td>
                </tr>
              ) : recentTickets.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No tickets found</td>
                </tr>
              ) : (
                recentTickets.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/hcms/tickets/${c.id}`)}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#64748B', fontWeight: 500 }}>
                      {c.ticket_id || `#${c.id}`}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{c.category || 'General'}</div>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#64748B' }}>
                      {c.reporter_name || '—'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {getStatusPill(c.status)}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#64748B' }}>
                      {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Notifications */}
        <div style={{ width: 320, flexShrink: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 3px' }}>Notifications</h2>
              <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Updates from across your tickets</p>
            </div>
            <button
              onClick={handleMarkAllRead}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#64748B',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Mark all read
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notificationsLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#64748B', fontSize: 13 }}>No notifications</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #F1F5F9',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  cursor: 'pointer'
                }}>
                  {!n.isRead && (
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#3B82F6',
                      marginTop: 5,
                      flexShrink: 0
                    }} />
                  )}
                  {n.isRead && (
                    <span style={{ width: 6, marginTop: 5, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>{n.title || 'Notification'}</div>
                    <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>{n.description || ''}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
