import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, ChevronRight, X, AlertCircle } from 'lucide-react';

const f = "'Inter',ui-sans-serif,system-ui,sans-serif";
const card = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)' };

const PRIORITY_NAMES = ['Low','Medium','High','Critical'];
const PRIORITY_DOTS  = { Low:'#94A3B8', Medium:'#F59E0B', High:'#F97316', Critical:'#EF4444' };

const inputStyle = { width:'100%', height:38, border:'1px solid #E2E8F0', borderRadius:8, padding:'0 12px', fontSize:13, fontFamily:"'Inter',ui-sans-serif,system-ui,sans-serif", color:'#1E293B', outline:'none', boxSizing:'border-box' };
const labelStyle = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.05em' };

function ModalShell({ title, subtitle, onClose, onReset, onSave, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#FFFFFF', borderRadius:16, width:520, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:f }}>
        <div style={{ padding:'20px 24px 14px', borderBottom:'1px solid #F1F5F9', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <h2 style={{ fontSize:18, fontWeight:700, color:'#1E293B', margin:'0 0 3px' }}>{title}</h2>
            <p style={{ fontSize:13, color:'#94A3B8', margin:0 }}>{subtitle}</p>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', cursor:'pointer', padding:4 }}><X size={18} color="#94A3B8" /></button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>{children}</div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} style={{ height:36, padding:'0 18px', borderRadius:8, border:'1px solid #E2E8F0', background:'#FFFFFF', fontSize:13, fontWeight:600, color:'#374151', cursor:'pointer', fontFamily:f }}>Cancel</button>
          <button onClick={onReset} style={{ height:36, padding:'0 18px', borderRadius:8, border:'1px solid #E2E8F0', background:'#FFFFFF', fontSize:13, fontWeight:600, color:'#374151', cursor:'pointer', fontFamily:f }}>Reset</button>
          <button onClick={onSave} style={{ height:36, padding:'0 22px', borderRadius:8, border:'none', background:'#1E293B', color:'#FFFFFF', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:f }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function AddStatusModal({ onClose, onSave }) {
  const INIT = { name:'', order:'1', color:'#6366F1', status:'active' };
  const [form, setForm] = useState(INIT);
  const s = (k,v) => setForm(p => ({ ...p, [k]:v }));
  return (
    <ModalShell title="Add Status" subtitle="Define a ticket lifecycle status." onClose={onClose} onReset={() => setForm(INIT)} onSave={() => { if(form.name.trim()) { onSave(form); onClose(); } }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>Status Name</label>
          <input value={form.name} onChange={e => s('name', e.target.value)} placeholder="e.g. In Review" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Display Order</label>
          <input type="number" value={form.order} onChange={e => s('order', e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>Color</label>
          <div style={{ display:'flex', alignItems:'center', gap:8, height:38, border:'1px solid #E2E8F0', borderRadius:8, padding:'0 10px' }}>
            <input type="color" value={form.color} onChange={e => s('color', e.target.value)} style={{ width:28, height:24, border:'none', padding:0, borderRadius:4, cursor:'pointer', background:'transparent' }} />
            <span style={{ fontSize:13, color:'#1E293B' }}>{form.color.toUpperCase()}</span>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select value={form.status} onChange={e => s('status', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
            <option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </ModalShell>
  );
}

function AddPriorityModal({ onClose, onSave }) {
  const INIT = { name:'Low', color:PRIORITY_DOTS['Low'], slaValue:'5', slaUnit:'Days', status:'active' };
  const [form, setForm] = useState(INIT);
  const s = (k,v) => setForm(p => ({ ...p, [k]:v }));
  return (
    <ModalShell title="Add Priority" subtitle="Configure a priority level and its SLA." onClose={onClose} onReset={() => setForm(INIT)} onSave={() => { onSave(form); onClose(); }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>Priority Name</label>
          <select value={form.name} onChange={e => { const n=e.target.value; setForm(p=>({...p, name:n, color:PRIORITY_DOTS[n]||p.color})); }} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
            {PRIORITY_NAMES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Color</label>
          <div style={{ display:'flex', alignItems:'center', gap:8, height:38, border:'1px solid #E2E8F0', borderRadius:8, padding:'0 10px' }}>
            <input type="color" value={form.color} onChange={e => s('color', e.target.value)} style={{ width:28, height:24, border:'none', padding:0, borderRadius:4, cursor:'pointer', background:'transparent' }} />
            <span style={{ fontSize:13, color:'#1E293B' }}>{form.color.toUpperCase()}</span>
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>SLA Value</label>
          <input type="number" value={form.slaValue} onChange={e => s('slaValue', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>SLA Unit</label>
          <select value={form.slaUnit} onChange={e => s('slaUnit', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
            <option>Days</option><option>Hours</option>
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Status</label>
        <select value={form.status} onChange={e => s('status', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
          <option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
    </ModalShell>
  );
}

function AddRuleModal({ onClose, onSave, departments, priorities }) {
  const INIT = { dept:'', initOwner:'', escOwner:'', priority:'Medium', slaValue:'3', slaUnit:'Days', status:'active' };
  const [form, setForm] = useState(INIT);
  const s = (k,v) => setForm(p => ({ ...p, [k]:v }));
  return (
    <ModalShell title="Add Routing Rule" subtitle="Create a new routing rule or update an existing one." onClose={onClose} onReset={() => setForm(INIT)} onSave={() => { onSave(form); onClose(); }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>Department</label>
          <select value={form.dept} onChange={e => s('dept', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
            <option value="">Select Department</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Initial Owner</label>
          <input value={form.initOwner} onChange={e => s('initOwner', e.target.value)} placeholder="Role name" style={inputStyle} />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>Escalation Owner</label>
          <input value={form.escOwner} onChange={e => s('escOwner', e.target.value)} placeholder="Role name" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Default Priority</label>
          <select value={form.priority} onChange={e => s('priority', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
            {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={labelStyle}>SLA Value</label>
          <input type="number" value={form.slaValue} onChange={e => s('slaValue', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>SLA Unit</label>
          <select value={form.slaUnit} onChange={e => s('slaUnit', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
            <option>Days</option><option>Hours</option>
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Rule Status</label>
        <select value={form.status} onChange={e => s('status', e.target.value)} style={{ ...inputStyle, appearance:'auto', cursor:'pointer' }}>
          <option value="active">Active</option><option value="inactive">Inactive</option>
        </select>
      </div>
    </ModalShell>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ flex: 1, ...card, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: '#1E293B' }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, btnLabel, onAdd, children }) {
  return (
    <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>{title}</h2>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{subtitle}</p>
        </div>
        <button onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, background: '#1E293B', color: '#FFFFFF', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: f, flexShrink: 0 }}>
          <Plus size={14} />{btnLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

export default function AdminRoutingRules() {
  const [rules, setRules]           = useState([]);
  const [statuses, setStatuses]     = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showStatusModal,   setShowStatusModal]   = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showRuleModal,     setShowRuleModal]     = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch statuses
        const statusRes = await fetch('/api/admin/routing/statuses', { headers });
        if (!statusRes.ok) throw new Error('Failed to fetch statuses');
        const statusData = await statusRes.json();
        setStatuses(Array.isArray(statusData) ? statusData : (statusData.data || []));

        // Fetch priorities
        const priorityRes = await fetch('/api/admin/routing/priorities', { headers });
        if (!priorityRes.ok) throw new Error('Failed to fetch priorities');
        const priorityData = await priorityRes.json();
        setPriorities(Array.isArray(priorityData) ? priorityData : (priorityData.data || []));

        // Fetch routing rules
        const rulesRes = await fetch('/api/admin/routing/rules', { headers });
        if (!rulesRes.ok) throw new Error('Failed to fetch routing rules');
        const rulesData = await rulesRes.json();
        setRules(rulesData.data || []);

        // Fetch departments for dropdown
        const deptsRes = await fetch('/api/admin/departments', { headers });
        if (!deptsRes.ok) throw new Error('Failed to fetch departments');
        const deptsData = await deptsRes.json();
        setDepartments(deptsData.data || []);
      } catch (err) {
        console.error('Error fetching routing data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAddStatus = async (form) => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/routing/statuses', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          label: form.name,
          display_order: parseInt(form.order),
          color: form.color,
          is_active: form.status === 'active'
        })
      });
      if (!res.ok) throw new Error('Failed to add status');
      
      const statusRes = await fetch('/api/admin/routing/statuses', { headers });
      const statusData = await statusRes.json();
      setStatuses(Array.isArray(statusData) ? statusData : (statusData.data || []));
    } catch (err) {
      console.error('Error adding status:', err);
      alert('Failed to add status: ' + err.message);
    }
  };

  const handleAddPriority = async (form) => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/routing/priorities', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          label: form.name,
          color: form.color,
          sla_value: parseInt(form.slaValue),
          sla_unit: form.slaUnit.toLowerCase(),
          is_active: form.status === 'active'
        })
      });
      if (!res.ok) throw new Error('Failed to add priority');
      
      const priorityRes = await fetch('/api/admin/routing/priorities', { headers });
      const priorityData = await priorityRes.json();
      setPriorities(Array.isArray(priorityData) ? priorityData : (priorityData.data || []));
    } catch (err) {
      console.error('Error adding priority:', err);
      alert('Failed to add priority: ' + err.message);
    }
  };

  const handleAddRule = async (form) => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
      const res = await fetch('/api/admin/routing/rules', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          department_id: form.dept,
          initial_owner_role: form.initOwner,
          escalation_owner_role: form.escOwner,
          default_priority_id: form.priority,
          sla_value: parseInt(form.slaValue),
          sla_unit: form.slaUnit.toLowerCase(),
          status: form.status
        })
      });
      if (!res.ok) throw new Error('Failed to add routing rule');
      
      const rulesRes = await fetch('/api/admin/routing/rules', { headers });
      const rulesData = await rulesRes.json();
      setRules(rulesData.data || []);
    } catch (err) {
      console.error('Error adding routing rule:', err);
      alert('Failed to add routing rule: ' + err.message);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const res = await fetch(`/api/admin/routing/rules/${ruleId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) throw new Error('Failed to delete routing rule');
      
      const rulesRes = await fetch('/api/admin/routing/rules', { headers });
      const rulesData = await rulesRes.json();
      setRules(rulesData.data || []);
    } catch (err) {
      console.error('Error deleting routing rule:', err);
      alert('Failed to delete routing rule: ' + err.message);
    }
  };

  const th = { padding: '10px 20px', fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #E2E8F0' };

  if (loading) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#64748B' }}>Loading routing rules...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: f, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} color="#EF4444" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 14, color: '#EF4444', marginBottom: 8 }}>Error loading routing rules</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: f }}>
      {showStatusModal   && <AddStatusModal   onClose={() => setShowStatusModal(false)}   onSave={handleAddStatus} />}
      {showPriorityModal && <AddPriorityModal onClose={() => setShowPriorityModal(false)} onSave={handleAddPriority} />}
      {showRuleModal     && <AddRuleModal     onClose={() => setShowRuleModal(false)}     onSave={handleAddRule} departments={departments} priorities={priorities} />}
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>System Administration</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1E293B', margin: '0 0 4px' }}>Status, Priority &amp; Routing</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Configure ticket statuses, priority SLAs, and ownership rules that govern every workflow.</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard label="Statuses"      value={statuses.length} />
        <StatCard label="Priorities"    value={priorities.length} />
        <StatCard label="Routing Rules" value={rules.length} />
        <StatCard label="Departments"   value={new Set(rules.map(r => r.department_id)).size} />
      </div>

      {/* Statuses */}
      <SectionCard title="Statuses" subtitle="Lifecycle states a ticket can be in. Used by routing, reports, and SLAs." btnLabel="+ Add Status" onAdd={() => setShowStatusModal(true)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 0, padding: '0 24px 20px' }}>
          {statuses.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13, gridColumn: '1 / -1' }}>
              No statuses configured
            </div>
          ) : (
            statuses.map((s, i) => (
              <div key={s.id} style={{ padding: '14px 0', borderRight: (i + 1) % 4 !== 0 ? '1px solid #F1F5F9' : 'none', paddingRight: (i + 1) % 4 !== 0 ? 20 : 0, paddingLeft: i % 4 !== 0 ? 20 : 0, borderBottom: i < 4 ? '1px solid #F1F5F9' : 'none', marginBottom: i < 4 ? 0 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.label || s.name}</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>{s.description || ''}</div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {/* Priority */}
      <SectionCard title="Priority" subtitle="Each priority drives the SLA applied to a ticket." btnLabel="+ Add Priority" onAdd={() => setShowPriorityModal(true)}>
        <div style={{ display: 'flex', borderTop: '1px solid #F1F5F9', padding: '0 24px 20px' }}>
          {priorities.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13, flex: 1 }}>
              No priorities configured
            </div>
          ) : (
            priorities.map((p, i) => (
              <div key={p.id} style={{ flex: 1, paddingTop: 20, borderRight: i < priorities.length - 1 ? '1px solid #F1F5F9' : 'none', paddingRight: i < priorities.length - 1 ? 24 : 0, paddingLeft: i > 0 ? 24 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{p.label || p.name}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>SLA</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>{p.sla_value} {p.sla_unit}</div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {/* Routing Rules table */}
      <SectionCard title="Routing Rules" subtitle="Controls which roles own a ticket and who it escalates to." btnLabel="+ Add Rule" onAdd={() => setShowRuleModal(true)}>
        <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px solid #E2E8F0' }}>
          <thead>
            <tr>
              <th style={th}>Department</th>
              <th style={th}>Initial Owner</th>
              <th style={th}>Escalation Owner</th>
              <th style={th}>Priority</th>
              <th style={th}>SLA</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                  No routing rules configured
                </td>
              </tr>
            ) : (
              rules.map((r, i) => {
                const dept = departments.find(d => d.id === r.department_id);
                const priority = priorities.find(p => p.id === r.default_priority_id);
                const priorityColor = priority ? priority.color : '#94A3B8';
                return (
                  <tr key={r.id} style={{ borderBottom: i < rules.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{dept?.name || '—'}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#F97316' }}>{r.initial_owner_role || '—'}</td>
                    <td style={{ padding: '14px 20px', fontSize: 13 }}>
                      <span style={{ color: r.escalation_owner_role?.includes('Head') || r.escalation_owner_role?.includes('Manager') ? '#3B82F6' : '#F97316' }}>{r.escalation_owner_role || '—'}</span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: priorityColor }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: priorityColor }} />{priority?.label || priority?.name || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: '#475569' }}>{r.sla_value} {r.sla_unit}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteRule(r.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8' }}><Trash2 size={14} /></button>
                        <ChevronRight size={15} color="#CBD5E1" />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
