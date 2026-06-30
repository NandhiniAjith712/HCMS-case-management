import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { STORAGE_KEYS } from '../../modules/auth/constants';
import { Shield, Save, AlertCircle, Check, X, Users } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5100';
const TICKET_TYPES = ['confidential', 'sensitive', 'anonymous'];
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const PERMISSIONS = [
  { key: 'can_view', label: 'View Case' },
  { key: 'can_view_employee_details', label: 'View Employee Details' },
  { key: 'can_edit', label: 'Edit Case' },
  { key: 'can_comment', label: 'Add Comments / Notes' },
  { key: 'can_perform_actions', label: 'Perform Actions' },
  { key: 'can_resolve', label: 'Mark Resolved' },
  { key: 'can_close', label: 'Close Case' }
];

export default function AdminCaseAccessConfig() {
  const [activeType, setActiveType] = useState(TICKET_TYPES[0]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState({});
  const [consentConfig, setConsentConfig] = useState(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentSuccess, setConsentSuccess] = useState(false);

  const loadConfig = async (ticketType) => {
    try {
      setLoading(true);
      setError(null);
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.get(`${API_BASE}/api/v2/case-access-config/${ticketType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setConfig(response.data.levels);
      } else {
        setError(response.data.message || 'Failed to load access configuration');
      }
    } catch (err) {
      console.error('Load config error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load access configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig(activeType);
  }, [activeType]);

  useEffect(() => {
    loadConsentConfig();
  }, []);

  const loadConsentConfig = async () => {
    try {
      setConsentLoading(true);
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const response = await axios.get(`${API_BASE}/api/v2/case-access-config/escalation-consent`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setConsentConfig(response.data.configs);
      }
    } catch (err) {
      console.error('Load consent config error:', err);
    } finally {
      setConsentLoading(false);
    }
  };

  const toggleConsent = (ticketType) => {
    setConsentConfig(prev => ({
      ...prev,
      [ticketType]: {
        ...(prev ? prev[ticketType] : null),
        require_consent: !(prev && prev[ticketType] && prev[ticketType].require_consent)
      }
    }));
  };

  const toggleOverrideRole = (ticketType, role) => {
    setConsentConfig(prev => {
      const current = prev && prev[ticketType] ? prev[ticketType].override_roles || [] : [];
      const next = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role];
      return {
        ...prev,
        [ticketType]: {
          ...(prev ? prev[ticketType] : null),
          override_roles: next
        }
      };
    });
  };

  const saveConsent = async () => {
    try {
      setConsentSaving(true);
      setConsentSuccess(false);
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      await axios.post(`${API_BASE}/api/v2/case-access-config/escalation-consent`, {
        configs: consentConfig
      }, { headers: { Authorization: `Bearer ${token}` } });
      setConsentSuccess(true);
      setTimeout(() => setConsentSuccess(false), 2000);
    } catch (err) {
      console.error('Save consent config error:', err);
    } finally {
      setConsentSaving(false);
    }
  };

  const togglePermission = (level, userId, permissionKey) => {
    setConfig(prev => {
      const next = { ...prev };
      const levelData = { ...next[level] };
      const users = levelData.users.map(u => {
        if (u.user_id !== userId) return u;
        const perms = { ...u.permissions, [permissionKey]: !u.permissions[permissionKey] };
        return { ...u, permissions: perms };
      });
      levelData.users = users;
      next[level] = levelData;
      return next;
    });
  };

  const saveLevel = async (level) => {
    try {
      setSaving(s => ({ ...s, [level]: true }));
      setSuccess(s => ({ ...s, [level]: false }));
      setError(null);
      const token = sessionStorage.getItem(STORAGE_KEYS.TOKEN);
      const permissions = config[level].users.map(u => ({
        user_id: u.user_id,
        ...u.permissions
      }));
      const response = await axios.post(
        `${API_BASE}/api/v2/case-access-config/${activeType}/${level}`,
        { permissions },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        setSuccess(s => ({ ...s, [level]: true }));
        setTimeout(() => setSuccess(s => ({ ...s, [level]: false })), 2000);
      } else {
        setError(response.data.message || 'Failed to save configuration');
      }
    } catch (err) {
      console.error('Save config error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to save configuration');
    } finally {
      setSaving(s => ({ ...s, [level]: false }));
    }
  };

  const f = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const thStyle = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 12px', fontSize: 13, color: '#1E293B', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' };
  const checkboxCellStyle = { padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #F1F5F9' };

  return (
    <div style={{ fontFamily: f, padding: '0 0 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Shield size={22} color="#1E293B" />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>Case Access Configuration</h1>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          Configure who can view, edit, comment, and act on Confidential, Sensitive, and Anonymous cases at each escalation level.
        </p>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} color="#DC2626" />
          <span style={{ fontSize: 13, color: '#991B1B' }}>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E2E8F0', marginBottom: 24 }}>
        {TICKET_TYPES.map(type => {
          const active = activeType === type;
          const label = type.charAt(0).toUpperCase() + type.slice(1);
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #1E293B' : '2px solid transparent',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? '#1E293B' : '#64748B',
                cursor: 'pointer',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Shield size={14} color={active ? '#1E293B' : '#94A3B8'} />
              {label}
            </button>
          );
        })}
      </div>

      {activeType === 'anonymous' && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 12, color: '#64748B' }}>
          Employee identity is always hidden for Anonymous tickets. The "View Employee Details" option is not available here.
        </div>
      )}

      {loading && !config && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading configuration...</div>
        </div>
      )}

      {config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {LEVELS.map(level => {
            const levelData = config[level] || { users: [] };
            if (levelData.users.length === 0) {
              return (
                <div key={level} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{level}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={14} /> No users are assigned to this escalation level.
                  </div>
                </div>
              );
            }
            const visiblePermissions = activeType === 'anonymous'
              ? PERMISSIONS.filter(p => p.key !== 'can_view_employee_details')
              : PERMISSIONS;

            return (
              <div key={level} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{level} Access Permissions</div>
                  <button
                    onClick={() => saveLevel(level)}
                    disabled={saving[level]}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: success[level] ? '#22C55E' : '#1E293B',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: saving[level] ? 'not-allowed' : 'pointer',
                      opacity: saving[level] ? 0.7 : 1
                    }}
                  >
                    {saving[level] ? (
                      <span>Saving...</span>
                    ) : success[level] ? (
                      <>
                        <Check size={14} /> Saved
                      </>
                    ) : (
                      <>
                        <Save size={14} /> Save {level}
                      </>
                    )}
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 180 }}>User</th>
                        <th style={{ ...thStyle, width: 120 }}>Role</th>
                        {visiblePermissions.map(p => (
                          <th key={p.key} style={{ ...thStyle, textAlign: 'center', width: 110 }} title={p.label}>
                            <div style={{ lineHeight: 1.3, maxWidth: 100, margin: '0 auto' }}>{p.label}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {levelData.users.map(u => (
                        <tr key={u.user_id}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600, color: '#1E293B' }}>{u.user_name}</div>
                            <div style={{ fontSize: 11, color: '#94A3B8' }}>{u.user_email}</div>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 11, fontWeight: 500, color: '#64748B', textTransform: 'capitalize' }}>
                              {String(u.user_role || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          {visiblePermissions.map(p => {
                            const checked = u.permissions[p.key];
                            return (
                              <td key={p.key} style={checkboxCellStyle}>
                                <button
                                  onClick={() => togglePermission(level, u.user_id, p.key)}
                                  style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 4,
                                    border: checked ? '2px solid #22C55E' : '2px solid #CBD5E1',
                                    background: checked ? '#22C55E' : '#FFFFFF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                  aria-label={`Toggle ${p.label} for ${u.user_name}`}
                                >
                                  {checked ? <Check size={12} color="#FFFFFF" /> : <X size={12} color="#CBD5E1" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Escalation Consent Configuration */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} /> Escalation Consent Configuration
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
              Require employee approval before a case can be escalated to the next level.
            </div>
          </div>
          <button
            onClick={saveConsent}
            disabled={consentLoading || consentSaving || !consentConfig}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: consentSuccess ? '#22C55E' : '#1E172A',
              color: '#FFFFFF', border: 'none', borderRadius: 6,
              padding: '8px 14px', fontSize: 12, fontWeight: 600,
              cursor: (consentLoading || consentSaving || !consentConfig) ? 'not-allowed' : 'pointer',
              opacity: (consentLoading || consentSaving || !consentConfig) ? 0.7 : 1
            }}
          >
            {consentSaving ? (
              <span>Saving...</span>
            ) : consentSuccess ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              <>
                <Save size={14} /> Save Consent Settings
              </>
            )}
          </button>
        </div>

        {consentLoading && !consentConfig && (
          <div style={{ fontSize: 13, color: '#64748B' }}>Loading consent configuration...</div>
        )}

        {consentConfig && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {['normal', 'confidential', 'sensitive', 'anonymous'].map(type => {
              const label = type.charAt(0).toUpperCase() + type.slice(1);
              const cfg = consentConfig[type] || { require_consent: false, override_roles: [] };
              return (
                <div key={type} style={{ padding: 16, borderRadius: 10, background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{label} tickets</div>
                    <button onClick={() => toggleConsent(type)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 6, border: '1px solid #E2E8F0',
                      background: cfg.require_consent ? '#1E172A' : '#FFFFFF',
                      color: cfg.require_consent ? '#FFFFFF' : '#64748B',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer'
                    }}>
                      {cfg.require_consent ? 'Yes' : 'No'}
                    </button>
                  </div>
                  {cfg.require_consent && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>Roles that can bypass consent</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {['system_admin', 'hr_executive', 'department_head', 'hr_manager', 'ceo'].map(role => {
                          const checked = cfg.override_roles.includes(role);
                          return (
                            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#1E293B', cursor: 'pointer' }}>
                              <button onClick={() => toggleOverrideRole(type, role)} style={{
                                width: 16, height: 16, borderRadius: 4, border: checked ? '2px solid #22C55E' : '2px solid #CBD5E1',
                                background: checked ? '#22C55E' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
                              }}>
                                {checked ? <Check size={10} color="#FFFFFF" /> : null}
                              </button>
                              {role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
