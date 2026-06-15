import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './BusinessDashboard.css';


const BusinessDashboard = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('products'); // 'products', 'sla', 'agents'
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    status: 'active'
  });



  // New state for agent management
  const [agents, setAgents] = useState([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);

  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    role: 'support_agent'
  });

  // New state for SLA management
  const [modules, setModules] = useState([]);
  const [slaConfigurations, setSlaConfigurations] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddSLA, setShowAddSLA] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [editingSLA, setEditingSLA] = useState(null);
  const [newModule, setNewModule] = useState({
    product_id: '',
    name: '',
    description: '',
    status: 'active'
  });
  const [newSLA, setNewSLA] = useState({
    product_id: '',
    module_id: '',
    issue_name: '',
    response_time_minutes: 480,
    resolution_time_minutes: 960,
    priority_level: 'P2',
    issue_description: '',
    is_active: true
  });

  // SLA Timer state
  const [slaTimers, setSlaTimers] = useState({});

  // Current user state
  const [currentUser, setCurrentUser] = useState(null);




  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const navigate = useNavigate();
  console.log('🔧 API_BASE configured as:', API_BASE);



  // Get current user from localStorage
  const getCurrentUser = () => {
    const storedUser = localStorage.getItem('tickUser');
    const storedAgent = localStorage.getItem('agentData');
    
    if (storedUser) {
      return JSON.parse(storedUser);
    } else if (storedAgent) {
      return JSON.parse(storedAgent);
    }
    return null;
  };

  // Check if user has permission to access business dashboard
  const hasBusinessAccess = () => {
    const currentUser = getCurrentUser();
    return currentUser && (currentUser.role === 'support_manager' || currentUser.role === 'ceo');
  };



  // Handle attachment viewing




  // Fetch all agents
  const fetchAgents = async () => {
    try {
      const agentsRes = await fetch(`${API_BASE}/agents`);
      const agentsJson = await agentsRes.json();

      const agents = agentsJson.success ? agentsJson.data : [];
      const sortedAgents = agents.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAgents(sortedAgents);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  // Add new agent
  const handleAddAgent = async (e) => {
    e.preventDefault();
    
    try {
      console.log('🔍 Original newAgent state:', newAgent);
      
      // Client-side validation
      if (newAgent.name.trim().length < 2) {
        alert('Name must be at least 2 characters long');
        return;
      }
      
      if (!newAgent.email || !newAgent.email.includes('@')) {
        alert('Please enter a valid email address');
        return;
      }
      
      // Clean up the data before sending
      const agentData = {
        name: newAgent.name.trim(),
        email: newAgent.email.trim(),
        role: newAgent.role || 'support_agent'
      };
      
      console.log('📤 Sending agent data:', agentData);
      
      const response = await fetch(`${API_BASE}/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentData)
      });
      
      console.log('📡 Response status:', response.status);
      
      const data = await response.json();
      console.log('📥 Response data:', data);
      
      if (data.success) {
        setShowAddAgent(false);
        setNewAgent({
          name: '',
          email: '',
          role: 'support_agent'
        });
        fetchAgents(); // Refresh the agents list
        
        // Display generated credentials
        const { credentials } = data.data;
        const credentialsMessage = `
🎉 Agent added successfully!

📋 Generated Login Credentials:
• Login ID: ${credentials.login_id}
• Password: ${credentials.password}

⚠️  IMPORTANT: Please save these credentials securely!
   The password cannot be retrieved later.

🔐 Staff can now login at: /staff/login
        `;
        
        alert(credentialsMessage);
      } else {
        console.error(' Agent registration failed:', data);
        
        // Show specific validation errors
        if (data.errors && data.errors.length > 0) {
          const errorMessages = data.errors.map(error => `${error.path}: ${error.msg}`);
          alert(`Validation failed:\n${errorMessages.join('\n')}`);
        } else {
          alert(data.message || 'Failed to add agent');
        }
      }
    } catch (error) {
      console.error('Error adding agent:', error);
      alert('Failed to add agent. Please try again.');
    }
  };

  // Edit agent
  const handleEditAgent = async (e) => {
    e.preventDefault();
    
    try {
      console.log('🔍 Editing agent:', editingAgent);
      
      // Client-side validation
      if (editingAgent.name.trim().length < 2) {
        alert('Name must be at least 2 characters long');
        return;
      }
      
      if (!editingAgent.email || !editingAgent.email.includes('@')) {
        alert('Please enter a valid email address');
        return;
      }
      
      // Clean up the data before sending
      const agentData = {
        name: editingAgent.name.trim(),
        email: editingAgent.email.trim(),
        role: editingAgent.role || 'agent',
        is_active: editingAgent.is_active
      };
      
      console.log(' Sending updated agent data:', agentData);
      
      const response = await fetch(`${API_BASE}/agents/${editingAgent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentData)
      });
      
      console.log('📡 Response status:', response.status);
      
      const data = await response.json();
      console.log(' Response data:', data);
      
      if (data.success) {
        setEditingAgent(null);
        fetchAgents(); // Refresh the agents list
        alert(' Agent updated successfully!');
      } else {
        console.error(' Agent update failed:', data);
        
        // Show specific validation errors
        if (data.errors && data.errors.length > 0) {
          const errorMessages = data.errors.map(error => `${error.path}: ${error.msg}`);
          alert(`Validation failed:\n${errorMessages.join('\n')}`);
        } else {
          alert(data.message || 'Failed to update agent');
        }
      }
    } catch (error) {
      console.error('Error updating agent:', error);
      alert('Failed to update agent. Please try again.');
    }
  };

  // Delete agent
  const handleDeleteAgent = async (agentId) => {
    // Get agent details for better confirmation
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      alert(' Agent not found');
      return;
    }

    // All agents are now in the agents table and can be deleted

    
    
    const confirmMessage = `🗑️ Delete Agent Confirmation

Are you sure you want to delete "${agent.name}" (${agent.role})?

⚠️  This action will:
• Permanently remove the agent account
• Delete their login credentials
• Cannot be undone

Type "DELETE" to confirm:`;

    const userInput = prompt(confirmMessage);
    
    if (userInput !== 'DELETE') {
      console.log(' Agent deletion cancelled by user');
      return;
    }
    
    try {
      console.log(' Deleting agent with ID:', agentId);
      
      const response = await fetch(`${API_BASE}/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log(' Agent deleted successfully:', data.message);
        
        // Show success message with details
              const message = ` Agent "${agent.name}" deleted successfully!`;
        
        alert(message);
        
        // Refresh the agents list
        fetchAgents();
      } else {
        console.error(' Failed to delete agent:', data.message);
        alert(' Failed to delete agent: ' + data.message);
      }
    } catch (error) {
      console.error(' Error deleting agent:', error);
      alert(' Error deleting agent. Please try again.');
    }
  };

  // Debug products state changes
  useEffect(() => {
    console.log('🔍 Products state changed:', products);
    console.log('🔍 Products length:', products ? products.length : 'undefined');
    if (products && products.length > 0) {
      console.log('🔍 First product:', products[0]);
    }
  }, [products]);

  // Fetch products
  const fetchProducts = async () => {
    try {
      console.log('🔍 Fetching products from:', `${API_BASE}/sla/products`);
      const response = await fetch(`${API_BASE}/sla/products`);
      console.log('📡 Products response status:', response.status);
      
      const data = await response.json();
      console.log('📦 Products data:', data);
      
      if (data.success) {
        console.log(` Found ${data.data.length} products`);
        setProducts(data.data);
        setError(''); // Clear any previous errors
        // Auto-select the first product if none is selected
        if (!selectedProduct && data.data.length > 0) {
          console.log('🎯 Auto-selecting first product:', data.data[0].name);
          setSelectedProduct(data.data[0]);
          fetchModules(data.data[0].id);
        }
      } else {
        console.error(' API returned error:', data.message);
        setError(data.message || 'Failed to fetch products');
      }
    } catch (error) {
      console.error(' Error fetching products:', error);
      setError('Failed to fetch products');
    }
  };



  useEffect(() => {
    console.log('🚀 BusinessDashboard useEffect triggered');
    setLoading(true); // Set loading to true when starting
    
    const initializeDashboard = async () => {
      try {
        await fetchProducts();
        await fetchAgents();
      } catch (error) {
        console.error(' Error initializing dashboard:', error);
        setError('Failed to initialize dashboard');
      } finally {
        setLoading(false); // Always set loading to false when done
      }
    };
    
    initializeDashboard();
  }, []);





  // Fetch modules for a specific product
  const fetchModules = async (productId) => {
    try {
      console.log('🔍 Fetching modules for product:', productId);
      const response = await fetch(`${API_BASE}/sla/modules`);
      const data = await response.json();
      
      if (data.success) {
        console.log(` Found ${data.data.length} modules`);
        // Filter modules by the selected product
        const productModules = data.data.filter(module => module.product_id == productId);
        console.log(`🎯 Product ${productId} has ${productModules.length} modules`);
        setModules(productModules);
      } else {
        console.error(' Failed to fetch modules:', data.message);
      }
    } catch (error) {
      console.error(' Error fetching modules:', error);
    }
  };

  // Fetch SLA configurations
  const fetchSLAConfigurations = async () => {
    try {
      const response = await fetch(`${API_BASE}/sla/configurations`);
      const data = await response.json();
      
      if (data.success) {
        console.log('📊 SLA Configurations fetched:', data.data);
        setSlaConfigurations(data.data);
      } else {
        console.error('Failed to fetch SLA configurations:', data.message);
      }
    } catch (error) {
      console.error('Error fetching SLA configurations:', error);
    }
  };

  // Handle product selection for SLA management
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    fetchModules(product.id);
  };

  // Add new module
  const handleAddModule = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_BASE}/sla/modules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newModule)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowAddModule(false);
        setNewModule({
          product_id: '',
          name: '',
          description: '',
          status: 'active'
        });
        fetchModules(selectedProduct.id);
      } else {
        alert(data.message || 'Failed to add module');
      }
    } catch (error) {
      console.error('Error adding module:', error);
      alert('Failed to add module');
    }
  };

  // Add new SLA configuration
  const handleAddSLA = async (e) => {
    e.preventDefault();
    
    try {
      console.log('➕ Adding new SLA configuration:', newSLA);
      console.log('➕ API endpoint:', `${API_BASE}/sla/configurations`);
      
      const response = await fetch(`${API_BASE}/sla/configurations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSLA)
      });
      
      console.log('➕ Response status:', response.status);
      const data = await response.json();
      console.log('➕ Response data:', data);
      
      if (data.success) {
        setShowAddSLA(false);
        setNewSLA({
          product_id: '',
          module_id: '',
          issue_name: '',
          response_time_minutes: 480,
          resolution_time_minutes: 960,
          priority_level: 'P2',
          issue_description: '',
          is_active: true
        });
        fetchSLAConfigurations();
        alert('SLA configuration added successfully!');
      } else {
        alert(data.message || 'Failed to add SLA configuration');
      }
    } catch (error) {
      console.error('Error adding SLA configuration:', error);
      alert('Failed to add SLA configuration');
    }
  };

  // Edit SLA configuration
  const handleEditSLA = async (e) => {
    e.preventDefault();
    
    try {
      console.log('🔧 Editing SLA configuration:', editingSLA);
      console.log('🔧 API endpoint:', `${API_BASE}/sla/configurations/${editingSLA.id}`);
      
      // Prepare the data to send (only the fields the backend expects)
      const updateData = {
        issue_name: editingSLA.issue_name,
        issue_description: editingSLA.issue_description || null,
        response_time_minutes: editingSLA.response_time_minutes,
        resolution_time_minutes: editingSLA.resolution_time_minutes,
        priority_level: editingSLA.priority_level,
        is_active: editingSLA.is_active
      };
      
      console.log('🔧 Data being sent to backend:', updateData);
      
      const response = await fetch(`${API_BASE}/sla/configurations/${editingSLA.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      console.log('🔧 Response status:', response.status);
      const data = await response.json();
      console.log('🔧 Response data:', data);
      
      if (data.success) {
        setShowAddSLA(false);
        setEditingSLA(null);
        fetchSLAConfigurations();
        alert('SLA configuration updated successfully!');
      } else {
        alert(data.message || 'Failed to update SLA configuration');
      }
    } catch (error) {
      console.error('Error updating SLA configuration:', error);
      alert('Failed to update SLA configuration');
    }
  };

  // Delete SLA configuration
  const handleDeleteSLA = async (slaId) => {
    if (!window.confirm('Are you sure you want to delete this SLA configuration? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/sla/configurations/${slaId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchSLAConfigurations();
        alert('SLA configuration deleted successfully!');
      } else {
        alert(data.message || 'Failed to delete SLA configuration');
      }
    } catch (error) {
      console.error('Error deleting SLA configuration:', error);
      alert('Failed to delete SLA configuration');
    }
  };

  // Delete module
  const handleDeleteModule = async (moduleId) => {
    if (!window.confirm('Are you sure you want to delete this module? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/sla/modules/${moduleId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchModules(selectedProduct.id);
        alert('✅ Module deleted successfully!');
      } else {
        const data = await response.json();
        alert(`❌ Failed to delete module: ${data.message}`);
      }
    } catch (error) {
      console.error('Error deleting module:', error);
      alert('❌ Failed to delete module. Please try again.');
    }
  };

  // Add new product
  const handleAddProduct = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_BASE}/sla/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newProduct.name,
          description: newProduct.description || '',
          status: newProduct.status
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowAddForm(false);
        setNewProduct({
          name: '',
          description: '',
          status: 'active'
        });
        fetchProducts(); // Refresh the list
      } else {
        setError(data.message || 'Failed to add product');
      }
    } catch (error) {
      console.error('Error adding product:', error);
      setError('Failed to add product');
    }
  };

  // Edit product
  const handleEditProduct = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_BASE}/sla/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: editingProduct.name,
          description: editingProduct.description || '',
          status: editingProduct.status
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setEditingProduct(null);
        fetchProducts(); // Refresh the list
        alert('✅ Product updated successfully!');
      } else {
        alert(`❌ Failed to update product: ${data.message}`);
      }
    } catch (error) {
      console.error('Error updating product:', error);
      alert('❌ Failed to update product. Please try again.');
    }
  };

  // Delete product
  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/sla/products/${productId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchProducts(); // Refresh the list
        alert('✅ Product deleted successfully!');
      } else {
        const data = await response.json();
        alert(`❌ Failed to delete product: ${data.message}`);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('❌ Failed to delete product. Please try again.');
    }
  };





  // Format SLA hours
  const formatSLAHours = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
  };

  // Format SLA timer display
  const formatSLATimer = (timer) => {
    if (!timer) return 'N/A';
    
    const { remaining_minutes, is_breached, is_warning } = timer;
    
    if (is_breached) {
      return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🚨 BREACHED</span>;
    }
    
    if (is_warning) {
      return <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>⚠️ {formatSLAHours(remaining_minutes)}</span>;
    }
    
    return <span style={{ color: '#10b981' }}>⏱️ {formatSLAHours(remaining_minutes)}</span>;
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'P0': return '#ff4444';
      case 'P1': return '#ff8800';
      case 'P2': return '#ffaa00';
      case 'P3': return '#44aa44';
      default: return '#666666';
    }
  };

  // Get priority label
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'P0': return 'Critical';
      case 'P1': return 'High';
      case 'P2': return 'Medium';
      case 'P3': return 'Low';
      default: return 'Unknown';
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return '#3b82f6';
      case 'in_progress': return '#f59e0b';
      case 'escalated': return '#ef4444';
      case 'closed': return '#10b981';
      default: return '#6b7280';
    }
  };

  // Get status label
  const getStatusLabel = (status) => {
    switch (status) {
      case 'new': return 'New';
      case 'in_progress': return 'In Progress';
      case 'escalated': return 'Escalated';
      case 'closed': return 'Closed';
      default: return status;
    }
  };





  console.log('🔄 BusinessDashboard render - loading:', loading, 'products:', products.length, 'error:', error);
  
  if (loading) {
    return (
      <div className="business-dashboard">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="business-dashboard">
      <div className="dashboard-header">
        <h1>Business Team Dashboard</h1>
        <p>Manage Products, SLA Settings, and Agent Management</p>
        <div className="header-actions">
          <a href="/products" className="product-dashboard-link">
            📊 Product Dashboard
          </a>
        </div>
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      <div className="dashboard-tabs">
        <button 
          className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          📦 Products & SLA
        </button>

        <button 
          className={`tab-btn ${activeTab === 'sla' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('sla');
            fetchSLAConfigurations();
          }}
        >
          ⏱️ SLA Management
        </button>
        <button 
          className={`tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          👨‍💼 Agent Management ({agents.length})
        </button>
        
      </div>

      {activeTab === 'products' && (
        <div className="products-section">
          <div className="section-header">
            <h2>📦 Product Management</h2>
            <button 
              className="add-product-btn"
              onClick={() => setShowAddForm(true)}
            >
              ➕ Add Product
            </button>
          </div>

          {showAddForm && (
            <div className="add-product-form">
              <h3>➕ Add New Product</h3>
              <form onSubmit={handleAddProduct}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                    placeholder="e.g., Authentication System"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                    placeholder="Product description..."
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={newProduct.status}
                    onChange={(e) => setNewProduct({...newProduct, status: e.target.value})}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="form-actions">
                  <button type="submit" className="save-btn">
                    ✅ Save Product
                  </button>
                  <button 
                    type="button" 
                    className="cancel-btn"
                    onClick={() => setShowAddForm(false)}
                  >
                    ❌ Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {editingProduct && (
            <div className="edit-product-form">
              <h3>✏️ Edit Product: {editingProduct.name}</h3>
              <form onSubmit={handleEditProduct}>
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                    placeholder="e.g., Authentication System"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={editingProduct.description || ''}
                    onChange={(e) => setEditingProduct({...editingProduct, description: e.target.value})}
                    placeholder="Product description..."
                    rows="3"
                  />
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e) => setEditingProduct({...editingProduct, status: e.target.value})}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="form-actions">
                  <button type="submit" className="save-btn">
                    ✅ Save Changes
                  </button>
                  <button 
                    type="button" 
                    className="cancel-btn"
                    onClick={() => setEditingProduct(null)}
                  >
                    ❌ Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="products-table">
            {console.log('🔍 Products data for table:', products)}
            <table style={{ 
              tableLayout: 'fixed', 
              width: '100%', 
              borderCollapse: 'collapse',
              border: '1px solid #e9ecef'
            }}>
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ 
                    width: '40%', 
                    padding: '15px', 
                    textAlign: 'left',
                    borderBottom: '2px solid #e9ecef',
                    backgroundColor: '#f8f9fa'
                  }}>
                    Product Name
                  </th>
                  <th style={{ 
                    width: '20%', 
                    padding: '15px', 
                    textAlign: 'center',
                    borderBottom: '2px solid #e9ecef',
                    backgroundColor: '#f8f9fa'
                  }}>
                    Status
                  </th>
                  <th style={{ 
                    width: '20%', 
                    padding: '15px', 
                    textAlign: 'center',
                    borderBottom: '2px solid #e9ecef',
                    backgroundColor: '#f8f9fa'
                  }}>
                    Created Date
                  </th>
                  <th style={{ 
                    width: '20%', 
                    padding: '15px', 
                    textAlign: 'center',
                    borderBottom: '2px solid #e9ecef',
                    backgroundColor: '#f8f9fa'
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {products && products.length > 0 ? (
                  products.map(product => (
                    <tr key={product.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                      <td style={{ 
                        width: '40%', 
                        padding: '15px', 
                        textAlign: 'left',
                        fontWeight: '600',
                        color: '#333'
                      }}>
                        {product.name}
                      </td>
                      <td style={{ 
                        width: '20%', 
                        padding: '15px', 
                        textAlign: 'center'
                      }}>
                        <span className={`status-badge ${product.status}`}>
                          {product.status === 'active' ? '✅ Active' : '❌ Inactive'}
                        </span>
                      </td>
                      <td style={{ 
                        width: '20%', 
                        padding: '15px', 
                        textAlign: 'center',
                        color: '#666'
                      }}>
                        {new Date(product.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ 
                        width: '20%', 
                        padding: '15px', 
                        textAlign: 'center'
                      }}>
                        <button 
                          className="edit-btn"
                          onClick={() => setEditingProduct(product)}
                          style={{
                            margin: '0 4px',
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.8em',
                            cursor: 'pointer',
                            backgroundColor: '#FF9800',
                            color: 'white'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          className="delete-btn"
                          onClick={() => handleDeleteProduct(product.id)}
                          style={{
                            margin: '0 4px',
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.8em',
                            cursor: 'pointer',
                            backgroundColor: '#f44336',
                            color: 'white'
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                      {loading ? '🔄 Loading products...' : '📦 No products found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {products.length === 0 && (
              <div className="no-products">
                <p>📦 No products found</p>
                <p>Click the "+" button to add your first product</p>
              </div>
            )}
          </div>
        </div>
      )}


          

          










      {activeTab === 'sla' && (
        <div className="sla-section">
          <div className="section-header">
            <h2>⏱️ SLA Management</h2>
            <p>Configure modules and SLA rules for each product</p>
          </div>

          {/* Product Selection */}
          <div className="product-selection">
            <h3>📦 Select Product</h3>
            <div className="product-grid">
              {products.map(product => (
                <button
                  key={product.id}
                  className={`product-card ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                  onClick={() => handleProductSelect(product)}
                >
                  <h4>{product.name}</h4>
                  <p>{product.description || 'No description'}</p>
                  <span className="product-status">{product.status}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedProduct && (
            <>
              {/* Modules Management */}
              <div className="modules-section">
                <div className="subsection-header">
                  <h3>🔧 Modules for {selectedProduct.name}</h3>
                  <button 
                    className="add-module-btn"
                    onClick={() => {
                      setNewModule({...newModule, product_id: selectedProduct.id});
                      setShowAddModule(true);
                    }}
                  >
                    ➕ Add Module
                  </button>
                </div>

                {showAddModule && (
                  <div className="add-module-form">
                    <h4>➕ Add New Module</h4>
                    <form onSubmit={handleAddModule}>
                      <div className="form-group">
                        <label>Module Name *</label>
                        <input
                          type="text"
                          value={newModule.name}
                          onChange={(e) => setNewModule({...newModule, name: e.target.value})}
                          placeholder="e.g., User Authentication"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          value={newModule.description}
                          onChange={(e) => setNewModule({...newModule, description: e.target.value})}
                          placeholder="Module description..."
                          rows="3"
                        />
                      </div>

                      <div className="form-group">
                        <label>Status</label>
                        <select
                          value={newModule.status}
                          onChange={(e) => setNewModule({...newModule, status: e.target.value})}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="save-btn">
                          ✅ Save Module
                        </button>
                        <button 
                          type="button" 
                          className="cancel-btn"
                          onClick={() => setShowAddModule(false)}
                        >
                          ❌ Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="modules-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Module Name</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modules.map(module => (
                        <tr key={module.id}>
                          <td className="module-name">{module.name}</td>
                          <td className="module-description">
                            {module.description || 'No description'}
                          </td>
                          <td>
                            <span className={`status-badge ${module.status}`}>
                              {module.status === 'active' ? '✅ Active' : '❌ Inactive'}
                            </span>
                          </td>
                          <td className="created-date">
                            {new Date(module.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {modules.length === 0 && (
                    <div className="no-modules">
                      <p>🔧 No modules found for this product</p>
                      <p>Click the "+" button to add your first module</p>
                    </div>
                  )}
                </div>
              </div>

              {/* SLA Configurations */}
              <div className="sla-configurations-table">
                <div className="table-header">
                  <h3>📋 SLA Configurations for {selectedProduct ? selectedProduct.name : 'All Products'}</h3>
                  <div className="table-actions">
                    <select 
                      value={selectedProduct ? selectedProduct.id : ''}
                      onChange={(e) => {
                        const product = products.find(p => p.id == e.target.value);
                        setSelectedProduct(product || null);
                        if (product) {
                          fetchModules(product.id);
                        }
                      }}
                      className="product-selector"
                    >
                      <option value="">All Products</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <button 
                      className="add-sla-btn"
                      onClick={() => {
                        if (selectedProduct) {
                          setNewSLA({...newSLA, product_id: selectedProduct.id});
                          setShowAddSLA(true);
                        } else {
                          alert('Please select a product first to add SLA rules');
                        }
                      }}
                    >
                      ➕ Add SLA Rule
                    </button>
                  </div>
                </div>
                
                {showAddSLA && (
                  <div className="add-sla-form">
                    <h4>{editingSLA ? '✏️ Edit SLA Configuration' : '➕ Add New SLA Configuration'}</h4>
                    <form onSubmit={editingSLA ? handleEditSLA : handleAddSLA}>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Module *</label>
                          <select
                            value={editingSLA ? editingSLA.module_id : newSLA.module_id}
                            onChange={(e) => {
                              if (editingSLA) {
                                setEditingSLA({...editingSLA, module_id: e.target.value});
                              } else {
                                setNewSLA({...newSLA, module_id: e.target.value});
                              }
                            }}
                            required
                          >
                            <option value="">Select Module</option>
                            {modules.map(module => (
                              <option key={module.id} value={module.id}>
                                {module.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Issue Type *</label>
                          <input
                            type="text"
                            value={editingSLA ? editingSLA.issue_name : newSLA.issue_name}
                            onChange={(e) => {
                              if (editingSLA) {
                                setEditingSLA({...editingSLA, issue_name: e.target.value});
                              } else {
                                setNewSLA({...newSLA, issue_name: e.target.value});
                              }
                            }}
                            placeholder="e.g., Login Issues"
                            required
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>Response Time (minutes) *</label>
                          <input
                            type="number"
                            value={editingSLA ? editingSLA.response_time_minutes : newSLA.response_time_minutes}
                            onChange={(e) => {
                              if (editingSLA) {
                                setEditingSLA({...editingSLA, response_time_minutes: parseInt(e.target.value)});
                              } else {
                                setNewSLA({...newSLA, response_time_minutes: parseInt(e.target.value)});
                              }
                            }}
                            min="5"
                            max="1440"
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>Resolution Time (minutes) *</label>
                          <input
                            type="number"
                            value={editingSLA ? editingSLA.resolution_time_minutes : newSLA.resolution_time_minutes}
                            onChange={(e) => {
                              if (editingSLA) {
                                setEditingSLA({...editingSLA, resolution_time_minutes: parseInt(e.target.value)});
                              } else {
                                setNewSLA({...newSLA, resolution_time_minutes: parseInt(e.target.value)});
                              }
                            }}
                            min="5"
                            max="1440"
                            required
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Priority Level *</label>
                        <select
                          value={editingSLA ? editingSLA.priority_level : newSLA.priority_level}
                          onChange={(e) => {
                            if (editingSLA) {
                              setEditingSLA({...editingSLA, priority_level: e.target.value});
                            } else {
                              setNewSLA({...newSLA, priority_level: e.target.value});
                            }
                          }}
                          required
                        >
                          <option value="">Select Priority</option>
                          <option value="P0">P0 - Critical</option>
                          <option value="P1">P1 - High</option>
                          <option value="P2">P2 - Medium</option>
                          <option value="P3">P3 - Low</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Description</label>
                        <textarea
                          value={editingSLA ? (editingSLA.issue_description || '') : newSLA.issue_description}
                          onChange={(e) => {
                            if (editingSLA) {
                              setEditingSLA({...editingSLA, issue_description: e.target.value});
                            } else {
                              setNewSLA({...newSLA, issue_description: e.target.value});
                            }
                          }}
                          placeholder="SLA rule description..."
                          rows="3"
                        />
                      </div>

                      <div className="form-group">
                        <label>
                          <input
                            type="checkbox"
                            checked={editingSLA ? editingSLA.is_active : newSLA.is_active}
                            onChange={(e) => {
                              if (editingSLA) {
                                setEditingSLA({...editingSLA, is_active: e.target.checked});
                              } else {
                                setNewSLA({...newSLA, is_active: e.target.checked});
                              }
                            }}
                          />
                          Active
                        </label>
                      </div>

                      <div className="form-actions">
                        <button type="submit" className="save-btn">
                          {editingSLA ? '✅ Save Changes' : '✅ Save SLA Rule'}
                        </button>
                        <button 
                          type="button" 
                          className="cancel-btn"
                          onClick={() => {
                            setShowAddSLA(false);
                            setEditingSLA(null);
                            setNewSLA({
                              product_id: '',
                              module_id: '',
                              issue_name: '',
                              response_time_minutes: 480,
                              resolution_time_minutes: 960,
                              priority_level: 'P2',
                              issue_description: '',
                              is_active: true
                            });
                          }}
                        >
                          ❌ Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}
                
                {slaConfigurations.filter(config => !selectedProduct || config.product_id === selectedProduct.id).length === 0 ? (
                  <div className="no-sla-configurations">
                    <div className="empty-state">
                      <span className="empty-icon">⏱️</span>
                      <h4>No SLA Configurations Found</h4>
                      <p>No SLA rules have been configured for this product yet.</p>
                      <p>Click the "+" button to add your first SLA rule.</p>
                    </div>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="sla-table">
                      <thead>
                        <tr>
                          <th className="th-module">Module</th>
                          <th className="th-issue">Issue Type</th>
                          <th className="th-time">Response Time</th>
                          <th className="th-resolution">Resolution Time</th>
                          <th className="th-priority">Priority</th>
                          <th className="th-status">Status</th>
                          <th className="th-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slaConfigurations
                          .filter(config => !selectedProduct || config.product_id === selectedProduct.id)
                          .map(config => (
                          <tr key={config.id} className="sla-row">
                            <td className="td-module">
                              <span className="module-name">{config.module_name || 'N/A'}</span>
                            </td>
                            <td className="td-issue">
                              <span className="issue-type">{config.issue_name || 'N/A'}</span>
                              {config.issue_description && (
                                <div className="issue-description">{config.issue_description}</div>
                              )}
                            </td>
                            <td className="td-time">
                              <span className="response-time">
                                {config.response_time_minutes ? formatSLAHours(config.response_time_minutes) : 'N/A'}
                              </span>
                            </td>
                            <td className="td-resolution">
                              <span className="resolution-time">
                                {config.resolution_time_minutes ? formatSLAHours(config.resolution_time_minutes) : 'N/A'}
                              </span>
                            </td>
                            <td className="td-priority">
                              {config.priority_level ? (
                                <span 
                                  style={{ 
                                    backgroundColor: getPriorityColor(config.priority_level),
                                    color: 'white',
                                    padding: '8px 16px',
                                    borderRadius: '20px',
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                    textAlign: 'center',
                                    display: 'inline-block',
                                    minWidth: '50px',
                                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px'
                                  }}
                                >
                                  {config.priority_level}
                                </span>
                              ) : (
                                <span style={{
                                  color: '#9ca3af',
                                  fontStyle: 'italic',
                                  fontSize: '14px'
                                }}>
                                  N/A
                                </span>
                              )}
                            </td>
                            <td className="td-status">
                              {config.is_active !== undefined ? (
                                <span className={`status-badge ${config.is_active ? 'active' : 'inactive'}`}>
                                  {config.is_active ? '✅ Active' : '❌ Inactive'}
                                </span>
                              ) : (
                                <span className="no-status">N/A</span>
                              )}
                            </td>
                            <td className="td-actions">
                              <div className="action-buttons">
                                <button 
                                  className="edit-btn"
                                  onClick={() => {
                                    setEditingSLA(config);
                                    setShowAddSLA(true);
                                  }}
                                  title="Edit SLA Configuration"
                                >
                                  ✏️
                                </button>
                                <button 
                                  className="delete-btn"
                                  onClick={() => handleDeleteSLA(config.id)}
                                  title="Delete SLA Configuration"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="agents-section">
          <div className="section-header">
            <h2>👨‍💼 Agent Management</h2>
            <div className="section-info">
              <p>Create staff accounts with auto-generated login credentials</p>
            </div>
            <button 
              className="add-agent-btn"
              onClick={() => {
                setNewAgent({
                  name: '',
                  email: '',
                  role: 'support_agent'
                });
                setShowAddAgent(true);
              }}
            >
              ➕ Add Staff Member
            </button>
          </div>

          {showAddAgent && (
            <div className="add-agent-form">
              <h3>➕ Add New Agent</h3>
              <form onSubmit={handleAddAgent}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name * (minimum 2 characters)</label>
                    <input
                      type="text"
                      value={newAgent.name}
                      onChange={(e) => setNewAgent({...newAgent, name: e.target.value})}
                      placeholder="Enter full name (minimum 2 characters)"
                      required
                      minLength={2}
                    />
                    {newAgent.name && newAgent.name.trim().length < 2 && (
                      <small style={{color: 'red'}}>
                        Name must be at least 2 characters long
                      </small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      value={newAgent.email}
                      onChange={(e) => setNewAgent({...newAgent, email: e.target.value})}
                      placeholder="Enter email address"
                      required
                    />
                    {newAgent.email && !newAgent.email.includes('@') && (
                      <small style={{color: 'red'}}>
                        Please enter a valid email address
                      </small>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={newAgent.role || 'support_agent'}
                    onChange={(e) => setNewAgent({...newAgent, role: e.target.value})}
                    className="form-select"
                  >
                    <option value="support_agent">Support Executive</option>
                    <option value="support_manager">Support Manager</option>
                    <option value="ceo">CEO</option>
                  </select>
                  <small>Select the role for this agent</small>
                </div>

                <div className="form-actions">
                  <button type="submit" className="save-btn">
                    ✅ Save Agent
                  </button>
                  <button 
                    type="button" 
                    className="cancel-btn"
                    onClick={() => {
                      setNewAgent({
                        name: '',
                        email: '',
                        role: 'support_agent'
                      });
                      setShowAddAgent(false);
                    }}
                  >
                    ❌ Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {editingAgent && (
            <div className="edit-agent-form">
              <h3>✏️ Edit Agent: {editingAgent.name}</h3>
              <form onSubmit={handleEditAgent}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name * (minimum 2 characters)</label>
                    <input
                      type="text"
                      value={editingAgent.name}
                      onChange={(e) => setEditingAgent({...editingAgent, name: e.target.value})}
                      placeholder="Enter full name (minimum 2 characters)"
                      required
                      minLength={2}
                    />
                    {editingAgent.name && editingAgent.name.trim().length < 2 && (
                      <small style={{color: 'red'}}>
                        Name must be at least 2 characters long
                      </small>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      value={editingAgent.email}
                      onChange={(e) => setEditingAgent({...editingAgent, email: e.target.value})}
                      placeholder="Enter email address"
                      required
                    />
                    {editingAgent.email && !editingAgent.email.includes('@') && (
                      <small style={{color: 'red'}}>
                        Please enter a valid email address
                      </small>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Role</label>
                  <input
                    type="text"
                    value={editingAgent.role ? editingAgent.role.replace('_', ' ') : 'Unknown'}
                    disabled
                    className="role-display"
                  />
                  <small>Role cannot be changed from this interface</small>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingAgent.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setEditingAgent({...editingAgent, is_active: e.target.value === 'active'})}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="form-actions">
                  <button type="submit" className="save-btn">
                    ✅ Save Changes
                  </button>
                  <button 
                    type="button" 
                    className="cancel-btn"
                    onClick={() => setEditingAgent(null)}
                  >
                    ❌ Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="agents-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>

                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>{agent.email}</td>
                    <td>
                      <span className={`role-badge ${agent.role || 'unknown'}`}>
                        {(agent.role || 'unknown').replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${agent.is_active ? 'active' : 'inactive'}`}>
                        {agent.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {agent.last_login ? 
                        new Date(agent.last_login).toLocaleDateString() 
                        : 'Never'
                      }
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          className="edit-btn"
                          onClick={() => {
                            // All agents can now be edited directly
                            setEditingAgent(agent);
                          }}
                          style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.8em',
                            cursor: 'pointer',
                            backgroundColor: '#FF9800',
                            color: 'white',
                            fontWeight: '500'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => handleDeleteAgent(agent.id)}
                          style={{
                            padding: '6px 12px',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.8em',
                            cursor: 'pointer',
                            backgroundColor: '#f44336',
                            color: 'white',
                            fontWeight: '500'
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {agents.length === 0 && (
              <div className="no-agents">
                <p>👨‍💼 No agents found</p>
                <p>Click the "+" button to add your first agent</p>
              </div>
            )}
          </div>
        </div>
      )}





    </div>
  );
};
export default BusinessDashboard; 
