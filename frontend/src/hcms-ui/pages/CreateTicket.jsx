import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { createCase } from '../services/caseApi';

function CreateTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    reporting_mode: 'web'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Title and description are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCase(formData);
      if (result.success) {
        navigate(`/hcms/tickets/${result.case.id}`, { replace: true });
      } else {
        setError(result.message || 'Failed to create case');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h2>Create New Case</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Title</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Case title"
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Describe the issue or request"
            rows={5}
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Category</label>
          <input
            type="text"
            name="category"
            value={formData.category}
            onChange={handleChange}
            placeholder="e.g., IT Support, HR, Facilities"
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Priority</label>
          <select
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4 }}>Reporting Mode</label>
          <select
            name="reporting_mode"
            value={formData.reporting_mode}
            onChange={handleChange}
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
          >
            <option value="web">Web Portal</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="in_person">In Person</option>
            <option value="other">Other</option>
          </select>
        </div>

        {error && <div style={{ color: 'red', padding: 8, background: '#fff0f0', borderRadius: 4 }}>{error}</div>}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{ padding: 12, background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
        >
          {isSubmitting ? 'Creating...' : 'Create Case'}
        </button>
      </form>
    </div>
  );
}

export default CreateTicket;
