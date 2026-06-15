import React, { useState, useEffect } from 'react';
import { getAuthHeaders, getAuthHeadersFormData, authenticatedFetch } from '../../utils/api';
import './SLAManagement.css';

const SLAManagement = () => {
  const [products, setProducts] = useState([]);
  const [modules, setModules] = useState([]);
  const [slaConfigurations, setSlaConfigurations] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Form states
  const [showProductForm, setShowProductForm] = useState(false);
  const [showModuleForm, setShowModuleForm] = useState(false);
  const [showSLAForm, setShowSLAForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Product form state
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    status: 'active',
    priority_allocation_type: 'ai_only'
  });

  // Module form state
  const [moduleForm, setModuleForm] = useState({
    product_id: '',
    name: '',
    description: '',
    status: 'active'
  });

  // SLA form state
  const [slaForm, setSlaForm] = useState({
    product_id: '',
    module_id: '',
    issue_type_id: '',
    issue_name: '',
    issue_description: '',
    response_time_minutes: '',
    resolution_time_minutes: '',
    business_hours_only: true,
    escalation_time_minutes: '',
    escalation_level: 'manager'
  });

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchModules(selectedProduct);
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (selectedProduct) {
      fetchSLAConfigurations(selectedProduct, selectedModule);
    }
  }, [selectedProduct, selectedModule]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/sla/products`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setMessage('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const fetchModules = async (productId) => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/sla/products/${productId}/modules`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setModules(data.data);
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
      setMessage('Failed to fetch modules');
    } finally {
      setLoading(false);
    }
  };

  const fetchSLAConfigurations = async (productId, moduleId) => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`${API_BASE}/sla/configurations?product_id=${productId || ''}&module_id=${moduleId || ''}`, {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setSlaConfigurations(data.data);
      }
    } catch (error) {
      console.error('Error fetching SLA configurations:', error);
      setMessage('Failed to fetch SLA configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const url = editingItem 
        ? `${API_BASE}/sla/products/${editingItem.id}`
        : `${API_BASE}/sla/products`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      const headers = getAuthHeaders();
      const response = await fetch(url, {
        method,
        headers: headers,
        body: JSON.stringify(productForm)
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage(editingItem ? 'Product updated successfully' : 'Product created successfully');
        setShowProductForm(false);
        setEditingItem(null);
        setProductForm({ name: '', description: '', status: 'active', priority_allocation_type: 'ai_only' });
        fetchProducts();
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      console.error('Error saving product:', error);
      setMessage('Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleModuleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const url = editingItem 
        ? `${API_BASE}/sla/modules/${editingItem.id}`
        : `${API_BASE}/sla/modules`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      const headers = getAuthHeaders();
      const response = await fetch(url, {
        method,
        headers: headers,
        body: JSON.stringify(moduleForm)
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage(editingItem ? 'Module updated successfully' : 'Module created successfully');
        setShowModuleForm(false);
        setEditingItem(null);
        setModuleForm({ product_id: '', name: '', description: '', status: 'active' });
        fetchModules(selectedProduct);
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      console.error('Error saving module:', error);
      setMessage('Failed to save module');
    } finally {
      setLoading(false);
    }
  };

  const handleSLASubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const url = editingItem 
        ? `${API_BASE}/sla/configurations/${editingItem.id}`
        : `${API_BASE}/sla/configurations`;
      
      const method = editingItem ? 'PUT' : 'POST';
      
      const headers = getAuthHeaders();
      const response = await fetch(url, {
        method,
        headers: headers,
        body: JSON.stringify(slaForm)
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage(editingItem ? 'SLA configuration updated successfully' : 'SLA configuration created successfully');
        setShowSLAForm(false);
        setEditingItem(null);
        setSlaForm({
          product_id: '', module_id: '', issue_type_id: '', issue_name: '', issue_description: '',
          response_time_minutes: '', resolution_time_minutes: '',
          business_hours_only: true, escalation_time_minutes: '', escalation_level: 'manager'
        });
        fetchSLAConfigurations(selectedProduct, selectedModule);
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      console.error('Error saving SLA configuration:', error);
      setMessage('Failed to save SLA configuration');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours`;
    return `${Math.floor(minutes / 1440)} days`;
  };

  return (
    <div className="sla-management">
      <div className="sla-header">
        <h1>📋 SLA Management</h1>
        <p>Manage products, modules, and SLA configurations</p>
      </div>

      {message && (
        <div className={`message ${message.includes('successfully') ? 'success' : 'error'}`}>
          {message}
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <div className="sla-controls">
        <div className="control-group">
          <label>Product:</label>
          <select 
            value={selectedProduct} 
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">Select Product</option>
            {products.map(product => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <button onClick={() => setShowProductForm(true)}>+ Add Product</button>
        </div>

        {selectedProduct && (
          <div className="control-group">
            <label>Module:</label>
            <select 
              value={selectedModule} 
              onChange={(e) => setSelectedModule(e.target.value)}
            >
              <option value="">Select Module</option>
              {modules.map(module => (
                <option key={module.id} value={module.id}>
                  {module.name}
                </option>
              ))}
            </select>
            <button onClick={() => setShowModuleForm(true)}>+ Add Module</button>
          </div>
        )}

        {selectedProduct && (
          <div className="control-group">
            <button onClick={() => setShowSLAForm(true)}>+ Add SLA Configuration</button>
          </div>
        )}
      </div>

      {selectedProduct && (
        <div className="sla-configurations">
          <h2>SLA Configurations</h2>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <div className="configurations-grid">
              {slaConfigurations.map(config => (
                <div key={config.id} className="sla-card">
                  <div className="sla-header">
                    <h3>{config.issue_name}</h3>
                    <span className="business-hours">{config.scope_type?.replace('_', ' ') || 'EXACT'}</span>
                  </div>
                  <p className="issue-description">{config.issue_description}</p>
                  <div className="sla-times">
                    <div className="time-item">
                      <span className="label">Response:</span>
                      <span className="value">{formatTime(config.response_time_minutes)}</span>
                    </div>
                    <div className="time-item">
                      <span className="label">Resolution:</span>
                      <span className="value">{formatTime(config.resolution_time_minutes)}</span>
                    </div>
                    {config.escalation_time_minutes && (
                      <div className="time-item">
                        <span className="label">Escalation:</span>
                        <span className="value">{formatTime(config.escalation_time_minutes)}</span>
                      </div>
                    )}
                  </div>
                  <div className="sla-options">
                    <span className={`business-hours ${config.business_hours_only ? 'yes' : 'no'}`}>
                      {config.business_hours_only ? 'Business Hours Only' : '24/7'}
                    </span>
                    <span className="escalation-level">
                      Escalates to: {config.escalation_level}
                    </span>
                  </div>
                  <div className="sla-actions">
                    <button onClick={() => {
                      setEditingItem(config);
                      setSlaForm({
                        product_id: config.product_id,
                        module_id: config.module_id,
                        issue_type_id: config.issue_type_id || '',
                        issue_name: config.issue_name,
                        issue_description: config.issue_description,
                        response_time_minutes: config.response_time_minutes,
                        resolution_time_minutes: config.resolution_time_minutes,
                        business_hours_only: config.business_hours_only,
                        escalation_time_minutes: config.escalation_time_minutes,
                        escalation_level: config.escalation_level
                      });
                      setShowSLAForm(true);
                    }}>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Product Form Modal */}
      {showProductForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingItem ? 'Edit Product' : 'Add New Product'}</h2>
            <form onSubmit={handleProductSubmit}>
              <div className="form-group">
                <label>Product Name:</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => setProductForm({...productForm, description: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Status:</label>
                <select
                  value={productForm.status}
                  onChange={(e) => setProductForm({...productForm, status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label>Priority allocation type:</label>
                <select
                  value={productForm.priority_allocation_type || 'ai_only'}
                  onChange={(e) => setProductForm({ ...productForm, priority_allocation_type: e.target.value })}
                >
                  <option value="ai_only">AI business impact priority allocation</option>
                  <option value="user_then_ai_verify">User selects priority (AI verifies at submission)</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                </button>
                <button type="button" onClick={() => {
                  setShowProductForm(false);
                  setEditingItem(null);
                  setProductForm({ name: '', description: '', status: 'active', priority_allocation_type: 'ai_only' });
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module Form Modal */}
      {showModuleForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingItem ? 'Edit Module' : 'Add New Module'}</h2>
            <form onSubmit={handleModuleSubmit}>
              <div className="form-group">
                <label>Product:</label>
                <select
                  value={moduleForm.product_id}
                  onChange={(e) => setModuleForm({...moduleForm, product_id: e.target.value})}
                  required
                >
                  <option value="">Select Product</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Module Name:</label>
                <input
                  type="text"
                  value={moduleForm.name}
                  onChange={(e) => setModuleForm({...moduleForm, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={moduleForm.description}
                  onChange={(e) => setModuleForm({...moduleForm, description: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Status:</label>
                <select
                  value={moduleForm.status}
                  onChange={(e) => setModuleForm({...moduleForm, status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                </button>
                <button type="button" onClick={() => {
                  setShowModuleForm(false);
                  setEditingItem(null);
                  setModuleForm({ product_id: '', name: '', description: '', status: 'active' });
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SLA Configuration Form Modal */}
      {showSLAForm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingItem ? 'Edit SLA Configuration' : 'Add New SLA Configuration'}</h2>
            <form onSubmit={handleSLASubmit}>
              <div className="form-group">
                <label>Product:</label>
                <select
                  value={slaForm.product_id}
                  onChange={(e) => setSlaForm({...slaForm, product_id: e.target.value})}
                >
                  <option value="">All Products (Tenant Default)</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Module:</label>
                <select
                  value={slaForm.module_id}
                  onChange={(e) => setSlaForm({...slaForm, module_id: e.target.value})}
                >
                  <option value="">All Modules</option>
                  {modules.map(module => (
                    <option key={module.id} value={module.id}>
                      {module.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Issue Type ID (optional for defaults):</label>
                <input
                  type="text"
                  value={slaForm.issue_type_id}
                  onChange={(e) => setSlaForm({...slaForm, issue_type_id: e.target.value})}
                  placeholder="e.g. bug, login_issue"
                />
              </div>
              <div className="form-group">
                <label>Display Name:</label>
                <input
                  type="text"
                  value={slaForm.issue_name}
                  onChange={(e) => setSlaForm({...slaForm, issue_name: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Issue Description:</label>
                <textarea
                  value={slaForm.issue_description}
                  onChange={(e) => setSlaForm({...slaForm, issue_description: e.target.value})}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Business Hours Only:</label>
                  <select
                    value={slaForm.business_hours_only}
                    onChange={(e) => setSlaForm({...slaForm, business_hours_only: e.target.value === 'true'})}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No (24/7)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Response Time (minutes):</label>
                  <input
                    type="number"
                    value={slaForm.response_time_minutes}
                    onChange={(e) => setSlaForm({...slaForm, response_time_minutes: parseInt(e.target.value)})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Resolution Time (minutes):</label>
                  <input
                    type="number"
                    value={slaForm.resolution_time_minutes}
                    onChange={(e) => setSlaForm({...slaForm, resolution_time_minutes: parseInt(e.target.value)})}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Escalation Time (minutes):</label>
                  <input
                    type="number"
                    value={slaForm.escalation_time_minutes}
                    onChange={(e) => setSlaForm({...slaForm, escalation_time_minutes: parseInt(e.target.value)})}
                  />
                </div>
                <div className="form-group">
                  <label>Escalation Level:</label>
                  <select
                    value={slaForm.escalation_level}
                    onChange={(e) => setSlaForm({...slaForm, escalation_level: e.target.value})}
                  >
                    <option value="manager">Manager</option>
                    <option value="technical_manager">Technical Manager</option>
                    <option value="ceo">CEO</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : (editingItem ? 'Update' : 'Create')}
                </button>
                <button type="button" onClick={() => {
                  setShowSLAForm(false);
                  setEditingItem(null);
                  setSlaForm({
                    product_id: '', module_id: '', issue_type_id: '', issue_name: '', issue_description: '',
                    response_time_minutes: '', resolution_time_minutes: '',
                    business_hours_only: true, escalation_time_minutes: '', escalation_level: 'manager'
                  });
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SLAManagement; 