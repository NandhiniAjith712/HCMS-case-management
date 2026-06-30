import React from 'react';
import { AlertCircle, Clock, CheckCircle2, Lock, ArrowUp, Circle, MinusCircle, X } from 'lucide-react';

/**
 * Status Badge Component
 * Displays case status with premium pill styling matching reference exactly
 */
export function StatusBadge({ status }) {
  const statusConfig = {
    open: { label: 'Open', color: '#EA580C', bg: '#FFF1F2', border: '1px solid #FECACA', icon: AlertCircle },
    new: { label: 'Open', color: '#EA580C', bg: '#FFF1F2', border: '1px solid #FECACA', icon: AlertCircle },
    in_progress: { label: 'In Progress', color: '#CA8A04', bg: '#FFFBEB', border: '1px solid #FDE68A', icon: Clock },
    resolved: { label: 'Resolved', color: '#2563EB', bg: '#EFF6FF', border: '1px solid #BFDBFE', icon: CheckCircle2 },
    closed: { label: 'Closed', color: '#059669', bg: '#ECFDF5', border: '1px solid #A7F3D0', icon: CheckCircle2 },
    escalated: { label: 'Escalated', color: '#F97316', bg: '#FFF7ED', border: '1px solid #FDBA74', icon: ArrowUp },
    waiting: { label: 'Waiting', color: '#2563EB', bg: '#EFF6FF', border: '1px solid #BFDBFE', icon: Clock },
    rejected: { label: 'Rejected', color: '#DC2626', bg: '#FEF2F2', border: '1px solid #FECACA', icon: X },
  };

  const config = statusConfig[status] || { label: status, color: '#64748B', bg: '#F1F5F9', border: '1px solid #E2E8F0', icon: MinusCircle };
  const Icon = config.icon;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 16px',
        borderRadius: 999,
        fontSize: 15,
        fontWeight: 500,
        background: config.bg,
        color: config.color,
        border: config.border,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={14} strokeWidth={2.5} />
      </span>
      <span>{config.label}</span>
    </span>
  );
}

/**
 * Priority Badge Component
 * Displays case priority with premium pill styling
 */
export function PriorityBadge({ priority }) {
  const priorityConfig = {
    low: { label: 'Low', color: '#22C55E', bg: '#F0FDF4', icon: Circle },
    medium: { label: 'Medium', color: '#F59E0B', bg: '#FEFCE8', icon: Circle },
    high: { label: 'High', color: '#F97316', bg: '#FFF7ED', icon: Circle },
    critical: { label: 'Critical', color: '#EF4444', bg: '#FEF2F2', icon: Circle },
  };

  const config = priorityConfig[priority] || { label: priority, color: '#64748B', bg: '#F1F5F9', icon: Circle };
  const Icon = config.icon;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 16px',
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 500,
        background: config.bg,
        color: config.color,
      }}
    >
      <Icon size={14} />
      <span>{config.label}</span>
    </span>
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
