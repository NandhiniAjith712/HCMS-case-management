import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCase, uploadAttachments } from '../services/caseApi';
import { ArrowLeft, Send, Paperclip, Info } from 'lucide-react';

const inputBaseStyle = {
  width: '100%',
  padding: '0 14px',
  height: 44,
  borderRadius: 10,
  border: '1px solid #E2E8F0',
  fontSize: 14,
  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
  color: '#0F172A',
  background: '#FFFFFF',
  outline: 'none',
  transition: 'border-color 0.15s ease',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#0F172A',
  marginBottom: 8
};

function CreateTicket() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    reporting_mode: 'normal',
    attachments: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const res = await fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setDepartments(data.data || []);
        } else {
          const text = await res.text().catch(() => '');
          console.error('Failed to load departments:', res.status, text);
        }
      } catch (err) {
        console.error('Failed to load departments:', err);
      }
    };
    fetchDepartments();
  }, []);

  useEffect(() => {
    const fetchSubcategories = async () => {
      if (!formData.category) {
        setSubcategories([]);
        return;
      }
      const dept = departments.find(d => d.name === formData.category);
      if (!dept) return;
      try {
        const token = sessionStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('hcmsToken') || localStorage.getItem('token');
        const res = await fetch(`/api/departments/${dept.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const seen = new Set();
          const unique = (data.data?.subcategories || []).filter(s => {
            if (s.is_active === 0) return false;
            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
          });
          setSubcategories(unique);
        } else {
          const text = await res.text().catch(() => '');
          console.error('Failed to load subcategories:', res.status, text);
        }
      } catch (err) {
        console.error('Failed to load subcategories:', err);
      }
    };
    fetchSubcategories();
  }, [formData.category, departments]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...files] }));
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setFormData(prev => ({ ...prev, attachments: [...prev.attachments, ...files] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Subject and description are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        subcategory: formData.subcategory,
        priority: 'medium',
        reporting_mode: formData.reporting_mode
      };
      const result = await createCase(payload);
      if (result.success) {
        // Upload attachments if any
        if (formData.attachments.length > 0) {
          try {
            await uploadAttachments(result.case.id, formData.attachments);
          } catch (uploadErr) {
            console.error('[CreateTicket] Failed to upload attachments:', uploadErr);
            // Continue even if upload fails
          }
        }
        navigate(`/hcms/tickets/${result.case.id}`, { replace: true });
      } else {
        setError(result.message || 'Failed to create ticket');
      }
    } catch (err) {
      console.error('[CreateTicket] Failed to create ticket:', err);
      setError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      {/* Back Button */}
      <div>
        <button
          onClick={() => navigate('/hcms/tickets')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            color: '#64748B',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'border-color 0.15s ease, background 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#CBD5E1';
            e.currentTarget.style.background = '#F8FAFC';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#E2E8F0';
            e.currentTarget.style.background = '#FFFFFF';
          }}
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1.4fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Ticket Details Card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          {/* Card Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Ticket details</h2>
            <p style={{ fontSize: 13, fontWeight: 400, color: '#64748B', margin: 0 }}>All fields marked with <span style={{ color: '#EF4444' }}>*</span> are required</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Subject */}
            <div>
              <label style={labelStyle}>
                Subject <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Brief summary of the issue"
                maxLength={120}
                style={inputBaseStyle}
                required
              />
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, textAlign: 'right' }}>
                {formData.title.length}/120
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>
                Description <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe the issue, when it started, and any steps already taken..."
                rows={6}
                style={{
                  ...inputBaseStyle,
                  height: 140,
                  padding: '14px',
                  resize: 'none'
                }}
                required
              />
            </div>

            {/* Category & Subcategory */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Category <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={e => setFormData(prev => ({ ...prev, category: e.target.value, subcategory: '' }))}
                  style={{ ...inputBaseStyle, cursor: 'pointer' }}
                  required
                >
                  <option value="">Select category</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  Subcategory <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleChange}
                  style={{ ...inputBaseStyle, cursor: 'pointer' }}
                  required
                  disabled={!formData.category}
                >
                  <option value="">{formData.category ? 'Choose subcategory' : 'Choose category first'}</option>
                  {subcategories.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reporting Mode */}
            <div>
              <label style={labelStyle}>
                Reporting mode <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                name="reporting_mode"
                value={formData.reporting_mode}
                onChange={handleChange}
                style={{ ...inputBaseStyle, cursor: 'pointer' }}
              >
                <option value="normal">Normal</option>
                <option value="confidential">Confidential</option>
                <option value="anonymous">Anonymous</option>
                <option value="sensitive">Sensitive</option>
              </select>
              <p style={{ fontSize: 12, color: '#64748B', margin: '6px 0 0' }}>
                <Info size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                {formData.reporting_mode === 'normal' && 'Standard workflow applies.'}
                {formData.reporting_mode === 'confidential' && 'Restricted visibility. Only authorized personnel can view.'}
                {formData.reporting_mode === 'anonymous' && 'Your identity will be hidden from all viewers.'}
                {formData.reporting_mode === 'sensitive' && 'Employee-selected sensitive matter (e.g., harassment, mental health, workplace conflict). No AI-based detection is used.'}
              </p>
            </div>

            {/* Attachments */}
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>Attachments</label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                style={{
                  height: 120,
                  border: '1px dashed #E2E8F0',
                  background: '#FAFBFC',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#CBD5E1';
                  e.currentTarget.style.background = '#F8FAFC';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E2E8F0';
                  e.currentTarget.style.background = '#FAFBFC';
                }}
              >
                <input
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  id="attachment-input"
                />
                <label htmlFor="attachment-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, margin: 0 }}>
                  <Paperclip size={18} color="#64748B" strokeWidth={2} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Drag files here or choose file</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>PDF, PNG, JPG up to 10MB each</span>
                </label>
              </div>
              {formData.attachments.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {formData.attachments.map((file, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Paperclip size={12} color="#64748B" />
                      {file.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ padding: 12, background: '#FEF2F2', color: '#EF4444', borderRadius: 10, fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}
          </form>

          {/* Bottom Action Bar */}
          <div style={{ borderTop: '1px solid #E2E8F0', padding: '18px 24px', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              onClick={() => navigate('/hcms/tickets')}
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 10,
                background: '#FFFFFF',
                color: '#0F172A',
                border: '1px solid #E2E8F0',
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 10,
                background: '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 0.15s ease',
                opacity: isSubmitting ? 0.6 : 1
              }}
              onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.background = '#020617')}
              onMouseLeave={(e) => e.currentTarget.style.background = '#0F172A'}
            >
              <Send size={16} strokeWidth={2} />
              {isSubmitting ? 'Submitting...' : 'Submit ticket'}
            </button>
          </div>
        </div>

        {/* Right Sidebar Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Before You Submit Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Info size={18} color="#0F172A" strokeWidth={2} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>Before you submit</h3>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Choose the most specific subcategory for faster routing.',
                'Attach relevant docs (payslips, screenshots) to avoid back-and-forth.',
                'Average first response: under 4 working hours.'
              ].map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Need To Talk To Someone Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: 18 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Need to talk to someone?</h3>
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 14px' }}>Reach HR Helpdesk directly for urgent matters.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>Email</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0F172A' }}>hr-help@acme.co</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>Phone</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0F172A' }}>+1 (415) 555-0123</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateTicket;
