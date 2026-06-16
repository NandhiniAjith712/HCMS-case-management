import React from 'react';

/**
 * Status Badge Component
 * Displays case status with color-coded badge
 */
export function StatusBadge({ status }) {
  const statusConfig = {
    open: { label: 'Open', color: '#3b82f6', bg: '#dbeafe', icon: '📋' },
    in_progress: { label: 'In Progress', color: '#8b5cf6', bg: '#ede9fe', icon: '🔄' },
    resolved: { label: 'Resolved', color: '#10b981', bg: '#d1fae5', icon: '✅' },
    closed: { label: 'Closed', color: '#6b7280', bg: '#f3f4f6', icon: '🔒' },
    escalated: { label: 'Escalated', color: '#f97316', bg: '#ffedd5', icon: '⬆️' },
  };

  const config = statusConfig[status] || { label: status, color: '#6b7280', bg: '#f3f4f6', icon: '📌' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.color}30`
      }}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Priority Badge Component
 * Displays case priority with color-coded badge and indicator
 */
export function PriorityBadge({ priority }) {
  const priorityConfig = {
    low: { label: 'Low', color: '#10b981', bg: '#d1fae5', icon: '🟢', level: 1 },
    medium: { label: 'Medium', color: '#f59e0b', bg: '#fef3c7', icon: '🟡', level: 2 },
    high: { label: 'High', color: '#f97316', bg: '#ffedd5', icon: '🟠', level: 3 },
    critical: { label: 'Critical', color: '#ef4444', bg: '#fee2e2', icon: '🔴', level: 4 },
  };

  const config = priorityConfig[priority] || { label: priority, color: '#6b7280', bg: '#f3f4f6', icon: '⚪', level: 0 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: config.bg,
          color: config.color,
          border: `1px solid ${config.color}30`
        }}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
      {/* Priority level indicator dots */}
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4].map(level => (
          <div
            key={level}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: level <= config.level ? config.color : '#e5e7eb'
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Timeline Component
 * Displays case history as a vertical timeline
 */
export function Timeline({ history }) {
  if (!history || history.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
        No history available
      </div>
    );
  }

  const getActionIcon = (action) => {
    const icons = {
      created: '📝',
      updated: '✏️',
      status_changed: '🔄',
      assigned: '👤',
      commented: '💬',
      escalated: '⬆️',
      resolved: '✅',
      closed: '🔒',
      reopened: '🔓'
    };
    return icons[action] || '📌';
  };

  const getActionColor = (action) => {
    const colors = {
      created: '#3b82f6',
      updated: '#6b7280',
      status_changed: '#8b5cf6',
      assigned: '#10b981',
      commented: '#f59e0b',
      escalated: '#f97316',
      resolved: '#10b981',
      closed: '#6b7280',
      reopened: '#3b82f6'
    };
    return colors[action] || '#6b7280';
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Timeline line */}
      <div style={{
        position: 'absolute',
        left: 20,
        top: 0,
        bottom: 0,
        width: 2,
        background: '#e5e7eb'
      }} />

      {history.map((entry, index) => (
        <div key={index} style={{ position: 'relative', paddingLeft: 48, paddingBottom: 24 }}>
          {/* Timeline dot */}
          <div style={{
            position: 'absolute',
            left: 12,
            top: 0,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: getActionColor(entry.action),
            border: '3px solid white',
            boxShadow: '0 0 0 2px ' + getActionColor(entry.action),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10
          }}>
            {getActionIcon(entry.action)}
          </div>

          {/* Timeline content */}
          <div style={{
            background: 'white',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {entry.action.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              by {entry.user_name || 'System'}
            </div>

            {entry.changed_fields && Object.keys(entry.changed_fields).length > 0 && (
              <div style={{ background: '#f9fafb', padding: 12, borderRadius: 6, fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>Changes:</div>
                {Object.entries(entry.changed_fields).map(([field, change]) => (
                  <div key={field} style={{ marginBottom: 4 }}>
                    <span style={{ color: '#6b7280' }}>{field}:</span>{' '}
                    <span style={{ textDecoration: 'line-through', color: '#ef4444' }}>{change.old}</span>
                    {' → '}
                    <span style={{ color: '#10b981', fontWeight: 600 }}>{change.new}</span>
                  </div>
                ))}
              </div>
            )}

            {entry.comment && (
              <div style={{ marginTop: 8, padding: 8, background: '#f0f9ff', borderRadius: 4, fontSize: 13, fontStyle: 'italic' }}>
                "{entry.comment}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Workflow Progress Component
 * Visualizes case workflow state progress
 */
export function WorkflowProgress({ status }) {
  const workflowSteps = [
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' }
  ];

  const currentIndex = workflowSteps.findIndex(step => step.key === status);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
      {workflowSteps.map((step, index) => (
        <React.Fragment key={step.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: index <= currentIndex ? '#3b82f6' : '#e5e7eb',
                color: index <= currentIndex ? 'white' : '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600
              }}
            >
              {index + 1}
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: index <= currentIndex ? '#1f2937' : '#9ca3af' }}>
              {step.label}
            </span>
          </div>
          {index < workflowSteps.length - 1 && (
            <div style={{
              width: 32,
              height: 2,
              background: index < currentIndex ? '#3b82f6' : '#e5e7eb'
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
