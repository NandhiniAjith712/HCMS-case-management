import React from 'react';

function NotificationTabs({ activeTab, setActiveTab, totalCount, unreadCount, ticketCount, mentionCount }) {
  const tabs = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'unread', label: 'Unread', count: unreadCount },
    { id: 'tickets', label: 'Tickets', count: ticketCount },
    { id: 'mentions', label: 'Mentions', count: mentionCount }
  ];

  return (
    <div style={{
      display: 'flex',
      gap: '6px',
      marginBottom: '18px'
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 999,
            border: activeTab === tab.id ? 'none' : '1px solid #E5E7EB',
            background: activeTab === tab.id ? '#0F172A' : 'white',
            color: activeTab === tab.id ? 'white' : '#374151',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (activeTab !== tab.id) {
              e.currentTarget.style.background = '#F9FAFB';
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab.id) {
              e.currentTarget.style.background = 'white';
            }
          }}
        >
          {tab.label}
          <span style={{
            minWidth: '18px',
            height: '18px',
            borderRadius: 999,
            background: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : '#F3F4F6',
            color: activeTab === tab.id ? 'white' : '#6B7280',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px'
          }}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  );
}

export default NotificationTabs;
