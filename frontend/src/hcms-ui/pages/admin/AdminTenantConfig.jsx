import React, { useState, useEffect } from 'react';
import { Upload, RotateCcw, Save, ChevronDown, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 20 };
const inputStyle = { width: '100%', height: 38, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, color: '#1E293B', outline: 'none', boxSizing: 'border-box', background: '#FFFFFF' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIMEZONES = ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore'];

const INIT = {
  company_name: '', company_code: '', email_domain: '',
  website: '', contact_email: '',
  contact_phone: '', address: '',
  start_time: '09:30', end_time: '18:30', timezone: 'Asia/Kolkata',
  working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
};

export default function AdminTenantConfig() {
  const [form, setForm] = useState(INIT);
  const [tzOpen, setTzOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };
        const res = await fetch('/api/admin/tenant-config', { headers });
        if (!res.ok) throw new Error('Failed to fetch tenant config');
        const data = await res.json();
        const cfg = data.data || data;
        if (cfg && (cfg.company_name || cfg.id)) {
          setForm({
            company_name: cfg.company_name || '',
            company_code: cfg.company_code || '',
            email_domain: cfg.email_domain || '',
            website: cfg.website || '',
            contact_email: cfg.contact_email || '',
            contact_phone: cfg.contact_phone || '',
            address: cfg.address || '',
            start_time: cfg.start_time || cfg.working_hours_start || '09:30',
            end_time: cfg.end_time || cfg.working_hours_end || '18:30',
            timezone: cfg.timezone || 'Asia/Kolkata',
            working_days: cfg.working_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
          });
        }
      } catch (err) {
        console.error('Error fetching tenant config:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const toggleDay = (d) => {
    set('working_days', form.working_days.includes(d) ? form.working_days.filter(x => x !== d) : [...form.working_days, d]);
  };

  const handleReset = () => {
    setForm(INIT);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/tenant-config', {
        method: 'POST',
        headers,
        body: JSON.stringify(form)
      });
      if (!res.ok) throw new Error('Failed to save tenant config');
      alert('Tenant configuration saved successfully');
    } catch (err) {
      console.error('Error saving tenant config:', err);
      alert('Failed to save tenant configuration: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading tenant configuration...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading tenant configuration</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      {/* Tenant chip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '4px 12px', borderRadius: 999, border: '1px solid #E2E8F0' }}>Tenant: {form.company_name || 'Not configured'}</span>
      </div>

      {/* Company Information */}
      <div style={card}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #E2E8F0' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: '0 0 3px' }}>Company Information</h2>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Basic details about your organization.</p>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Company Name</label>
              <input style={inputStyle} value={form.company_name} onChange={e => set('company_name', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Company Code</label>
              <input style={inputStyle} value={form.company_code} onChange={e => set('company_code', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 10, background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 20 }}>🏢</span>
              </div>
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: f }}>
                <Upload size={14} />Upload logo
              </button>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>PNG or SVG, up to 2 MB</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Email Domain</label>
              <input style={inputStyle} value={form.email_domain} onChange={e => set('email_domain', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input style={inputStyle} value={form.website} onChange={e => set('website', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Contact Email</label>
              <input style={inputStyle} value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Contact Phone</label>
              <input style={inputStyle} value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Address</label>
            <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={3}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: f, color: '#1E293B', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: '#FFFFFF' }} />
          </div>
        </div>
      </div>

      {/* Working Hours */}
      <div style={card}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #E2E8F0' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1E293B', margin: '0 0 3px' }}>Working Hours</h2>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Used for SLA calculations and routing rules.</p>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)}
                style={{ ...inputStyle }} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)}
                style={{ ...inputStyle }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Working Days</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              {DAYS.map(d => {
                const active = form.working_days.includes(d);
                return (
                  <button key={d} onClick={() => toggleDay(d)} style={{
                    height: 36, padding: '0 16px', borderRadius: 999, border: 'none', fontFamily: f,
                    background: active ? '#1E293B' : '#F1F5F9', color: active ? '#FFFFFF' : '#64748B',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer'
                  }}>{d}</button>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Example: Monday–Friday</p>
          </div>

          <div>
            <label style={labelStyle}>Timezone</label>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setTzOpen(o => !o)} style={{ ...inputStyle, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: '#1E293B' }}>{form.timezone}</span>
                <ChevronDown size={14} color="#94A3B8" />
              </button>
              {tzOpen && (
                <div style={{ position: 'absolute', top: 42, left: 0, right: 0, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 50, padding: '4px 0' }}>
                  {TIMEZONES.map(tz => (
                    <div key={tz} onClick={() => { set('timezone', tz); setTzOpen(false); }} style={{ padding: '9px 14px', fontSize: 13, color: form.timezone === tz ? '#3B82F6' : '#1E293B', background: form.timezone === tz ? '#EFF6FF' : 'transparent', cursor: 'pointer', fontWeight: form.timezone === tz ? 600 : 400 }}>{tz}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 18px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: f }}>
          <RotateCcw size={14} />Reset
        </button>
        <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 18px', borderRadius: 8, border: 'none', background: saving ? '#94A3B8' : '#1E293B', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: f }}>
          <Save size={14} />{saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
