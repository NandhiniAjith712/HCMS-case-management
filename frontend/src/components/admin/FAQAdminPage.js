import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildApiUrl, getAuthHeaders, getAuthHeadersFormData } from '../../utils/api';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import './FAQAdminPage.css';

const FAQ_CATEGORIES = [
  'Billing', 'Login', 'Communication', 'Technical Support', 'Account',
  'General', 'Feature Request', 'Bug Report', 'Onboarding', 'Integrations',
  'Security', 'Performance', 'Documentation', 'Other'
];

const FAQAdminPage = ({ onLogout }) => {
  const navigate = useNavigate();
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([...FAQ_CATEGORIES]);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ product: '', category: '', question: '', answer: '' });
  const [uploadStatus, setUploadStatus] = useState(null);
  const [bulkFile, setBulkFile] = useState(null);
  const formRef = useRef(null);

  useEffect(() => {
    fetchFaqs();
    fetchProducts();
    fetchCategories();
  }, [productFilter]);

  useEffect(() => {
    if (editingId && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingId]);

  const fetchCategories = async () => {
    try {
      const params = productFilter ? `?product=${encodeURIComponent(productFilter)}` : '';
      const res = await fetch(buildApiUrl(`/api/faqs/categories${params}`), { headers: getAuthHeaders() });
      const data = await res.json();
      const fromApi = (data.success ? data.data || [] : []).filter(Boolean);
      const merged = [...new Set([...FAQ_CATEGORIES, ...fromApi])].filter(Boolean).sort();
      setCategories(merged);
    } catch {
      setCategories([...FAQ_CATEGORIES]);
    }
  };

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const baseParams = new URLSearchParams();
      baseParams.set('limit', '9999');
      if (productFilter) baseParams.set('product', productFilter);
      const res = await fetch(buildApiUrl(`/api/faqs?${baseParams.toString()}`), { headers: getAuthHeaders() });
      const data = await res.json();
      setFaqs(data.success ? data.data || [] : []);
    } catch (e) {
      setFaqs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(buildApiUrl('/api/faqs/products'), { headers: getAuthHeaders() });
      const data = await res.json();
      const list = (data.success ? data.data || [] : []).map(p => (typeof p === 'object' ? p?.name : p)).filter(Boolean);
      setProducts(list);
    } catch {
      setProducts([]);
    }
  };

  const handleAdd = () => {
    setEditingId(null);
    setShowAddForm(true);
    setForm({ product: '', category: '', question: '', answer: '' });
  };

  const handleEdit = (faq) => {
    setEditingId(faq.id);
    setShowAddForm(false);
    setForm({
      product: faq.product,
      category: faq.category,
      question: faq.question,
      answer: faq.answer
    });
  };

  const handleSave = async () => {
    if (!form.product || !form.category || !form.question || !form.answer) return;
    try {
      const url = editingId
        ? buildApiUrl(`/api/faqs/${editingId}`)
        : buildApiUrl('/api/faqs');
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...form } : form;
      const res = await fetch(url, {
        method,
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        fetchFaqs();
        fetchProducts();
        fetchCategories();
        setEditingId(null);
        setShowAddForm(false);
        setForm({ product: '', category: '', question: '', answer: '' });
      } else {
        alert(data.message || 'Failed to save');
      }
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this FAQ?')) return;
    try {
      const res = await fetch(buildApiUrl(`/api/faqs/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        fetchFaqs();
        fetchProducts();
        fetchCategories();
      } else {
        alert(data.message || 'Failed to delete');
      }
    } catch (e) {
      alert('Failed to delete: ' + e.message);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      setUploadStatus('Please select a file');
      return;
    }
    setUploadStatus('Uploading...');
    try {
      const fd = new FormData();
      fd.append('file', bulkFile);
      const res = await fetch(buildApiUrl('/api/faqs/bulk-import'), {
        method: 'POST',
        headers: getAuthHeadersFormData(),
        body: fd
      });
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.ok ? 'Invalid response from server' : text || `Upload failed (${res.status})`);
      }
      if (data.success) {
        setUploadStatus(`Imported ${data.data?.imported ?? 0} FAQ(s)`);
        setBulkFile(null);
        document.getElementById('bulk-file')?.value && (document.getElementById('bulk-file').value = '');
        fetchFaqs();
        fetchProducts();
        fetchCategories();
      } else {
        setUploadStatus('Error: ' + (data.message || 'Upload failed'));
      }
    } catch (e) {
      setUploadStatus('Error: ' + (e.message || 'Upload failed'));
    }
  };

  return (
    <div className="faq-admin-page faq-admin-ref">
      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">FAQ management</h1>
              <p className="adr-header__welcome">
                Add, edit, delete FAQs, or bulk import from Excel/CSV
              </p>
            </div>
          </div>
          <div className="adr-header__actions">
            <button
              type="button"
              className="adr-btn adr-btn--ghost"
              onClick={() => navigate('/ceo')}
            >
              <svg
                className="adr-btn__icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to dashboard
            </button>
            <HeaderNotificationBell />
            {typeof onLogout === 'function' ? (
              <button type="button" className="adr-btn adr-btn--ghost adr-btn--logout" onClick={onLogout}>
                <svg
                  className="adr-btn__icon adr-btn__icon--danger"
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="faq-admin-main">
        <div className="faq-admin-container">
          <div className="faq-admin-actions">
          <div className="faq-filter">
            <label htmlFor="faq-product-filter">Filter by product:</label>
            <select
              id="faq-product-filter"
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="faq-product-select"
            >
              <option value="">All products</option>
              {products.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <button type="button" className="faq-add-btn" onClick={handleAdd}>
            + Add FAQ
          </button>
          </div>

          <div className="faq-section-divider" />

          <div className="faq-bulk-section">
          <h3>Bulk Import</h3>
          <p>Excel/CSV format: Product | Category | Question | Answer</p>
          <div className="faq-bulk-input">
            <input
              id="bulk-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => setBulkFile(e.target.files?.[0])}
            />
            <button type="button" onClick={handleBulkUpload}>
              Upload
            </button>
          </div>
          {uploadStatus && <p className="faq-upload-status">{uploadStatus}</p>}
          </div>

          {(editingId || showAddForm) && (
          <>
            <div className="faq-section-divider" />
            <div className="faq-form-section">
              <div className="faq-form-card" ref={formRef}>
                <h3>{editingId ? 'Edit FAQ' : 'New FAQ'}</h3>
                <div className="faq-form-grid">
                  <div className="faq-form-product-field">
                    <input
                      list="faq-product-list"
                      placeholder="Product"
                      value={form.product}
                      onChange={e => setForm({ ...form, product: e.target.value })}
                    />
                    <datalist id="faq-product-list">
                      {products.map(p => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="faq-category-select"
                  >
                    <option value="">Select category</option>
                    {[...new Set([...categories, ...(form.category && !categories.includes(form.category) ? [form.category] : [])])].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    className="full"
                    placeholder="Question"
                    value={form.question}
                    onChange={e => setForm({ ...form, question: e.target.value })}
                  />
                  <textarea
                    className="full"
                    placeholder="Answer"
                    value={form.answer}
                    onChange={e => setForm({ ...form, answer: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="faq-form-btns">
                  <button type="button" onClick={handleSave}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="cancel"
                    onClick={() => {
                      setEditingId(null);
                      setShowAddForm(false);
                      setForm({ product: '', category: '', question: '', answer: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
          )}

          <div className="faq-section-divider" />

          <div className="faq-list-section">
          <h3>FAQs ({faqs.length})</h3>
          {loading ? (
            <p className="faq-loading">Loading…</p>
          ) : faqs.length === 0 ? (
            <p className="faq-empty">No FAQs yet. Add one or bulk import.</p>
          ) : (
            <table className="faq-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Question</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {faqs.map(f => (
                  <tr key={f.id}>
                    <td>{f.product}</td>
                    <td>{f.category}</td>
                    <td>{f.question}</td>
                    <td>
                      <button type="button" className="edit-btn" onClick={() => handleEdit(f)}>
                        Edit
                      </button>
                      <button type="button" className="delete-btn" onClick={() => handleDelete(f.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default FAQAdminPage;
