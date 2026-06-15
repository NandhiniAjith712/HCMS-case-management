import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders, buildApiUrl } from '../../utils/api';
import { formatDateIST, formatDateTimeIST } from '../../utils/dateTime';
import MdashKpiIcon from './MdashKpiIcon';
import FeedbackInsightsPage from '../feedback/FeedbackInsightsPage';
import HeaderNotificationBell from '../common/HeaderNotificationBell';
import './CEODashboard.css';
import './CEODashboard.ref.css';

function CeoSidebarIcon({ name }) {
  const c = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };
  switch (name) {
    case 'executive':
      return (
        <svg {...c}>
          <path d="M3 3v18h18" />
          <path d="M18 17V9" />
          <path d="M13 17V5" />
          <path d="M8 17v-3" />
        </svg>
      );
    case 'departments':
      return (
        <svg {...c}>
          <path d="M3 21h18" />
          <path d="M5 21V7l8-4v18" />
          <path d="M19 21V11l-6-4" />
        </svg>
      );
    case 'agents':
      return (
        <svg {...c}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      );
    case 'assignments':
      return (
        <svg {...c}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case 'trends':
      return (
        <svg {...c}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      );
    case 'strategic':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      );
    case 'feedback':
      return (
        <svg {...c}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </svg>
      );
    default:
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

function ticketActivityMs(t) {
  const c = t?.created_at ? new Date(t.created_at).getTime() : 0;
  const u = t?.updated_at ? new Date(t.updated_at).getTime() : 0;
  const x = Math.max(c, u);
  return Number.isFinite(x) ? x : 0;
}

const NAV_UNREAD_TABS = ['assignments'];

const CEODashboard = ({ ceo, onLogout }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!ceo || ceo.role !== 'ceo') {
      navigate('/login', { replace: true });
    }
  }, [ceo, navigate]);

  const [tickets, setTickets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [departmentsForAgents, setDepartmentsForAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('executive');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshIntervalRef = useRef(null);

  // Products & SLA state
  const [products, setProducts] = useState([]);
  const [modules, setModules] = useState([]);
  const [slaConfigurations, setSlaConfigurations] = useState([]);
  const [slaPerformance, setSlaPerformance] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSLAProduct, setSelectedSLAProduct] = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddSLA, setShowAddSLA] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingModule, setEditingModule] = useState(null);
  const [editingSLA, setEditingSLA] = useState(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    status: 'active',
    priority_allocation_type: 'ai_only'
  });
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
    issue_description: '',
    is_active: true
  });

  // Agent management state (reusing existing agents/departments state from line 106-107)
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    role: 'support_agent',
    level: 'L1',
    primary_department_id: '',
    manager_id: '',
    additional_permissions: [],
    skills: []
  });

  // Success/error notifications
  const [successMessage, setSuccessMessage] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);

  // Custom confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const confirmResolveRef = useRef(null);

  const [executiveMetrics, setExecutiveMetrics] = useState({
    totalTickets: 0,
    resolvedTickets: 0,
    avgResolutionTime: 0,
    customerSatisfaction: 0,
    departmentPerformance: [],
    monthlyTrends: [],
    agentPerformance: []
  });

  const [agentSortField, setAgentSortField] = useState(null);
  const [agentSortDirection, setAgentSortDirection] = useState('asc');
  const [assignmentsSortField, setAssignmentsSortField] = useState(null);
  const [assignmentsSortDirection, setAssignmentsSortDirection] = useState('asc');
  const [listSortConfig, setListSortConfig] = useState({ key: 'updated_at', direction: 'desc' });
  /** When set on Executive tab, show full ticket list for this slice instead of KPI cards. */
  const [executiveTicketFilter, setExecutiveTicketFilter] = useState(null);

  const ceoTabSeenStorageKey =
    ceo?.id != null ? `ceoDashTabLastSeen:${ceo.id}` : null;
  const [tabLastSeenMs, setTabLastSeenMs] = useState(null);
  const tabSeenPrevTabRef = useRef(undefined);

  useEffect(() => {
    if (!ceoTabSeenStorageKey) return;
    try {
      const raw = localStorage.getItem(ceoTabSeenStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = {};
        for (const k of NAV_UNREAD_TABS) {
          next[k] = typeof parsed[k] === 'number' && Number.isFinite(parsed[k]) ? parsed[k] : Date.now();
        }
        setTabLastSeenMs(next);
        localStorage.setItem(ceoTabSeenStorageKey, JSON.stringify(next));
      } else {
        const initial = Object.fromEntries(NAV_UNREAD_TABS.map((k) => [k, Date.now()]));
        localStorage.setItem(ceoTabSeenStorageKey, JSON.stringify(initial));
        setTabLastSeenMs(initial);
      }
    } catch {
      const initial = Object.fromEntries(NAV_UNREAD_TABS.map((k) => [k, Date.now()]));
      try {
        localStorage.setItem(ceoTabSeenStorageKey, JSON.stringify(initial));
      } catch {}
      setTabLastSeenMs(initial);
    }
  }, [ceoTabSeenStorageKey]);

  useEffect(() => {
    if (!ceoTabSeenStorageKey || !tabLastSeenMs) return;
    const prev = tabSeenPrevTabRef.current;
    if (!NAV_UNREAD_TABS.includes(activeTab)) {
      tabSeenPrevTabRef.current = activeTab;
      return;
    }
    const arrived = prev !== activeTab;
    tabSeenPrevTabRef.current = activeTab;
    if (!arrived) return;
    setTabLastSeenMs((p) => {
      if (!p) return p;
      const next = { ...p, [activeTab]: Date.now() };
      try {
        localStorage.setItem(ceoTabSeenStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [activeTab, ceoTabSeenStorageKey, tabLastSeenMs]);

  useEffect(() => {
    if (activeTab !== 'executive') setExecutiveTicketFilter(null);
  }, [activeTab]);

  const sortAgents = (agentList, field, direction) => {
    if (!field) return agentList;
    return [...agentList].sort((a, b) => {
      let aValue = a[field];
      let bValue = b[field];
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      if (!aValue && !bValue) return 0;
      if (!aValue) return direction === 'asc' ? 1 : -1;
      if (!bValue) return direction === 'asc' ? -1 : 1;
      if (direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  };

  const sortAssignments = (assignments, field, direction) => {
    if (!field) return assignments;
    return [...assignments].sort((a, b) => {
      let aValue = a[field];
      let bValue = b[field];
      if (field === 'created_at') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      if (!aValue && !bValue) return 0;
      if (!aValue) return direction === 'asc' ? 1 : -1;
      if (!bValue) return direction === 'asc' ? -1 : 1;
      if (direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  };

  const handleAgentSort = (field) => {
    if (agentSortField === field) {
      setAgentSortDirection(agentSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setAgentSortField(field);
      setAgentSortDirection('asc');
    }
  };

  const handleAssignmentsSort = (field) => {
    if (assignmentsSortField === field) {
      setAssignmentsSortDirection(assignmentsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setAssignmentsSortField(field);
      setAssignmentsSortDirection('asc');
    }
  };

  const fetchExecutiveData = async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      if (isRefresh) setIsRefreshing(true);
      setError('');
      const headers = getAuthHeaders();
      const cacheBust = `_t=${Date.now()}`;
      const [ticketsResponse, departmentsResponse, agentsResponse] = await Promise.all([
        fetch(buildApiUrl(`/api/tickets?${cacheBust}`), { headers }),
        fetch(buildApiUrl(`/api/agents?role=support_manager&${cacheBust}`), { headers }),
        fetch(buildApiUrl(`/api/agents?role=support_agent&${cacheBust}`), { headers })
      ]);

      let ticketsData = [];
      let departmentsList = [];
      let agentsList = [];

      if (ticketsResponse.ok) {
        const result = await ticketsResponse.json();
        ticketsData = result.success ? result.data || [] : [];
        setTickets(ticketsData);
      } else {
        throw new Error(`Failed to fetch tickets: ${ticketsResponse.status}`);
      }

      if (departmentsResponse.ok) {
        const departmentsData = await departmentsResponse.json();
        departmentsList = departmentsData.success ? departmentsData.data || [] : [];
        setDepartments(departmentsList);
      }

      if (agentsResponse.ok) {
        const agentsData = await agentsResponse.json();
        agentsList = agentsData.success ? (agentsData.data || []) : [];
        setAgents(agentsList);
      }

      calculateExecutiveMetrics(ticketsData, departmentsList, agentsList);
      setLastUpdated(new Date());
      if (isRefresh) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error('Error fetching executive data:', err);
      setError(`Failed to load dashboard data: ${err.message}`);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const calculateExecutiveMetrics = (ticketsData, departmentsList, agentsList = []) => {
    const totalTickets = ticketsData.length;
    const resolvedTicketsCount = ticketsData.filter((t) => t.status === 'closed').length;
    const resolvedTickets = ticketsData.filter((t) => t.status === 'closed');
    const resolvedTicketsWithTime = resolvedTickets.filter((t) => t.resolution_time);
    const avgResolutionTime =
      resolvedTicketsWithTime.length > 0
        ? resolvedTicketsWithTime.reduce((acc, ticket) => acc + ticket.resolution_time, 0) /
            resolvedTicketsWithTime.length /
            60
        : 0;
    const ratedTickets = ticketsData.filter((t) => t.satisfaction_rating);
    const avgSatisfaction =
      ratedTickets.length > 0
        ? ratedTickets.reduce((acc, ticket) => acc + ticket.satisfaction_rating, 0) / ratedTickets.length
        : 0;

    const departmentPerformance = departmentsList.map((dept) => ({
      ...dept,
      totalTickets: ticketsData.filter((t) => t.department === dept.department).length,
      resolvedTickets: ticketsData.filter((t) => t.department === dept.department && t.status === 'closed')
        .length,
      avgResolutionTime: calculateDeptAvgTime(ticketsData.filter((t) => t.department === dept.department))
    }));

    const agentPerformance = agentsList.map((agent) => {
      const agentTickets = ticketsData.filter((t) => t.assigned_to === agent.id);
      const agentResolved = agentTickets.filter((t) => t.status === 'closed');
      const agentAvgTime = calculateDeptAvgTime(agentTickets);
      return {
        ...agent,
        totalTickets: agentTickets.length,
        resolvedTickets: agentResolved.length,
        avgResolutionTime: agentAvgTime,
        resolutionRate:
          agentTickets.length > 0 ? Math.round((agentResolved.length / agentTickets.length) * 100) : 0
      };
    });

    const monthlyTrends = calculateMonthlyTrends(ticketsData);

    setExecutiveMetrics({
      totalTickets,
      resolvedTickets: resolvedTicketsCount,
      avgResolutionTime: Math.round(avgResolutionTime),
      customerSatisfaction: Math.round(avgSatisfaction * 10) / 10,
      departmentPerformance,
      monthlyTrends,
      agentPerformance
    });
  };

  const calculateDeptAvgTime = (deptTickets) => {
    if (deptTickets.length === 0) return 0;
    const totalTime = deptTickets.reduce((acc, ticket) => {
      if (ticket.resolution_time) acc += ticket.resolution_time;
      return acc;
    }, 0);
    return Math.round(totalTime / deptTickets.length);
  };

  const calculateMonthlyTrends = (ticketsData) => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = formatDateIST(date, { month: 'short' });
      const monthTickets = ticketsData.filter((ticket) => {
        const ticketDate = new Date(ticket.created_at);
        return ticketDate.getMonth() === date.getMonth() && ticketDate.getFullYear() === date.getFullYear();
      });
      months.push({
        month: monthName,
        tickets: monthTickets.length,
        resolved: monthTickets.filter((t) => t.status === 'closed').length
      });
    }
    return months;
  };

  useEffect(() => {
    fetchExecutiveData();
    refreshIntervalRef.current = setInterval(() => fetchExecutiveData(true), 30000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);

  // Success notification
  const showSuccessNotification = (message) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setSuccessMessage('');
    }, 3000);
  };

  // Error notification
  const showErrorNotification = (message) => {
    setErrorMessage(message);
    setShowError(true);
    setTimeout(() => {
      setShowError(false);
      setErrorMessage('');
    }, 4000);
  };

  // Custom confirmation modal
  const confirmAction = (title, message) => {
    return new Promise((resolve) => {
      setConfirmTitle(title);
      setConfirmMessage(message);
      setShowConfirmModal(true);
      confirmResolveRef.current = resolve;
    });
  };

  const handleConfirmYes = () => {
    setShowConfirmModal(false);
    if (confirmResolveRef.current) confirmResolveRef.current(true);
  };

  const handleConfirmNo = () => {
    setShowConfirmModal(false);
    if (confirmResolveRef.current) confirmResolveRef.current(false);
  };

  // Fetch products
  const fetchProducts = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/sla/products'), {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      console.log('Products API response:', data);
      if (data.success) {
        console.log('Setting products:', data.data);
        setProducts(data.data);
      } else {
        console.error('Products API returned success=false:', data);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      showErrorNotification('Failed to fetch products');
    }
  };

  // Fetch modules
  const fetchModules = async (productId) => {
    if (!productId) return;
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/products/${productId}/modules`), {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setModules(data.data);
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
    }
  };

  // Fetch SLA configurations
  const fetchSLAConfigurations = async (productId) => {
    const targetProductId = productId || selectedSLAProduct?.id || selectedProduct?.id;
    if (!targetProductId) return;
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/products/${targetProductId}/configurations`), {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setSlaConfigurations(data.data);
      }
    } catch (error) {
      console.error('Error fetching SLA configurations:', error);
    }
  };

  // Fetch SLA performance data
  const fetchSLAPerformance = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/sla/performance-rates'), {
        method: 'GET',
        headers: headers
      });
      const data = await response.json();
      if (data.success) {
        setSlaPerformance(data.data);
      }
    } catch (error) {
      console.error('Error fetching SLA performance:', error);
    }
  };

  // Fetch data when switching to products tab
  useEffect(() => {
    if (activeTab === 'products') {
      fetchProducts();
      fetchSLAPerformance();
    } else if (activeTab === 'agents') {
      fetchAgents();
      fetchDepartments();
    }
  }, [activeTab]);

  // Handle product selection
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    fetchModules(product.id);
    fetchSLAConfigurations();
  };

  // Add product
  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/sla/products'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProduct.name,
          description: newProduct.description || '',
          status: newProduct.status,
          priority_allocation_type: newProduct.priority_allocation_type
        })
      });
      const data = await response.json();
      if (data.success) {
        setNewProduct({
          name: '',
          description: '',
          status: 'active',
          priority_allocation_type: 'ai_only'
        });
        setShowAddProduct(false);
        fetchProducts();
        showSuccessNotification('Product added successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to add product');
      }
    } catch (error) {
      console.error('Error adding product:', error);
      showErrorNotification('Failed to add product');
    }
  };

  // Edit product
  const handleEditProduct = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/products/${editingProduct.id}`), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingProduct.name,
          description: editingProduct.description || '',
          status: editingProduct.status,
          priority_allocation_type: editingProduct.priority_allocation_type
        })
      });
      const data = await response.json();
      if (data.success) {
        setEditingProduct(null);
        setShowAddProduct(false);
        fetchProducts();
        showSuccessNotification('Product updated successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      showErrorNotification('Failed to update product');
    }
  };

  // Delete product
  const handleDeleteProduct = async (productId) => {
    const confirmed = await confirmAction('Confirm Delete', 'Are you sure you want to delete this product? This action cannot be undone.');
    if (!confirmed) return;
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/products/${productId}`), {
        method: 'DELETE',
        headers
      });
      const data = await response.json();
      if (data.success) {
        fetchProducts();
        showSuccessNotification('Product deleted successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to delete product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      showErrorNotification('Failed to delete product');
    }
  };


  // Add new module
  const handleAddModule = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/sla/modules'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newModule)
      });
      const data = await response.json();
      if (data.success) {
        setNewModule({
          product_id: '',
          name: '',
          description: '',
          status: 'active'
        });
        setShowAddModule(false);
        fetchModules(selectedProduct.id);
        showSuccessNotification('Module added successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to add module');
      }
    } catch (error) {
      console.error('Error adding module:', error);
      showErrorNotification('Failed to add module');
    }
  };

  // Edit module
  const handleEditModule = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/modules/${editingModule.id}`), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingModule.name,
          description: editingModule.description,
          status: editingModule.status
        })
      });
      const data = await response.json();
      if (data.success) {
        setShowAddModule(false);
        setEditingModule(null);
        fetchModules(selectedProduct.id);
        showSuccessNotification('Module updated successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to update module');
      }
    } catch (error) {
      console.error('Error editing module:', error);
      showErrorNotification('Failed to update module');
    }
  };

  // Delete module
  const handleDeleteModule = async (moduleId) => {
    const confirmed = await confirmAction('Confirm Delete', 'Are you sure you want to delete this module?');
    if (!confirmed) return;
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/modules/${moduleId}`), {
        method: 'DELETE',
        headers
      });
      const data = await response.json();
      if (data.success) {
        fetchModules(selectedProduct.id);
        showSuccessNotification('Module deleted successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to delete module');
      }
    } catch (error) {
      console.error('Error deleting module:', error);
      showErrorNotification('Failed to delete module');
    }
  };

  // Add new SLA configuration
  const handleAddSLA = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/sla/configurations'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newSLA)
      });
      const data = await response.json();
      if (data.success) {
        setNewSLA({
          product_id: '',
          module_id: '',
          issue_name: '',
          response_time_minutes: 480,
          resolution_time_minutes: 960,
          issue_description: '',
          is_active: true
        });
        setShowAddSLA(false);
        fetchSLAConfigurations();
        showSuccessNotification('SLA configuration added successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to add SLA configuration');
      }
    } catch (error) {
      console.error('Error adding SLA configuration:', error);
      showErrorNotification('Failed to add SLA configuration');
    }
  };

  // Edit SLA configuration
  const handleEditSLA = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const updateData = {
        issue_name: editingSLA.issue_name,
        issue_description: editingSLA.issue_description || null,
        response_time_minutes: editingSLA.response_time_minutes,
        resolution_time_minutes: editingSLA.resolution_time_minutes,
        is_active: editingSLA.is_active
      };
      const response = await fetch(buildApiUrl(`/api/sla/configurations/${editingSLA.id}`), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      const data = await response.json();
      if (data.success) {
        setShowAddSLA(false);
        setEditingSLA(null);
        fetchSLAConfigurations();
        showSuccessNotification('SLA configuration updated successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to update SLA configuration');
      }
    } catch (error) {
      console.error('Error updating SLA configuration:', error);
      showErrorNotification('Failed to update SLA configuration');
    }
  };

  // Delete SLA configuration
  const handleDeleteSLA = async (slaId) => {
    const confirmed = await confirmAction('Confirm Delete', 'Are you sure you want to delete this SLA configuration? This action cannot be undone.');
    if (!confirmed) return;
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/configurations/${slaId}`), {
        method: 'DELETE',
        headers
      });
      const data = await response.json();
      if (data.success) {
        fetchSLAConfigurations();
        showSuccessNotification('SLA configuration deleted successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to delete SLA configuration');
      }
    } catch (error) {
      console.error('Error deleting SLA configuration:', error);
      showErrorNotification('Failed to delete SLA configuration');
    }
  };

  // Fetch agents
  const fetchAgents = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/agents?role=support_agent&_t=${Date.now()}`), { headers });
      const data = await response.json();
      if (data.success) {
        console.log('Fetched agents with skills:', data.data);
        const sortedAgents = data.data
          .filter(agent => String(agent.role || '').toLowerCase() !== 'ceo')
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAgents(sortedAgents);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl('/api/departments'), { headers });
      const data = await response.json();
      if (data.success) {
        setDepartmentsForAgents(data.data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  // Add new agent
  const handleAddAgent = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const lv = String(newAgent.level || 'L1').toUpperCase();
      const agentData = {
        name: newAgent.name.trim(),
        email: newAgent.email.trim(),
        role: newAgent.role || 'support_agent',
        primary_department_id: newAgent.primary_department_id ? parseInt(newAgent.primary_department_id) : null,
        manager_id: newAgent.role === 'support_agent' && newAgent.manager_id ? parseInt(newAgent.manager_id) : null,
        additional_permissions: newAgent.role === 'support_manager' ? newAgent.additional_permissions : [],
        skills: newAgent.skills || []
      };
      if (!['support_manager', 'ceo'].includes(newAgent.role)) {
        agentData.level = ['L1', 'L2', 'L3'].includes(lv) ? lv : 'L1';
      }
      console.log('🚀 Creating agent with payload:', agentData);
      const response = await fetch(buildApiUrl('/api/agents/register'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      });
      const data = await response.json();
      if (data.success) {
        setNewAgent({
          name: '',
          email: '',
          role: 'support_agent',
          level: 'L1',
          primary_department_id: '',
          manager_id: '',
          additional_permissions: [],
          skills: []
        });
        setShowAddAgent(false);
        fetchAgents();
        
        showSuccessNotification(data.message || 'Agent/Manager added successfully!');
      } else {
        if (data.errors && data.errors.length > 0) {
          const errorMessages = data.errors.map(error => `${error.path}: ${error.msg}`);
          showErrorNotification(`Validation failed: ${errorMessages.join(', ')}`);
        } else {
          showErrorNotification(data.message || 'Failed to add agent');
        }
      }
    } catch (error) {
      console.error('Error adding agent:', error);
      showErrorNotification('Failed to add agent');
    }
  };

  // Edit agent
  const handleEditAgent = async (e) => {
    e.preventDefault();
    try {
      const headers = getAuthHeaders();
      const lv = String(editingAgent.level || 'L1').toUpperCase();
      const agentData = {
        name: editingAgent.name.trim(),
        email: editingAgent.email.trim(),
        role: editingAgent.role || 'support_agent',
        is_active: editingAgent.is_active,
        primary_department_id: editingAgent.primary_department_id ? parseInt(editingAgent.primary_department_id) : null,
        manager_id: editingAgent.role === 'support_agent' && editingAgent.manager_id ? parseInt(editingAgent.manager_id) : null,
        additional_permissions: editingAgent.role === 'support_manager' ? editingAgent.additional_permissions : [],
        skills: editingAgent.skills || []
      };
      if (!['support_manager', 'ceo'].includes(editingAgent.role)) {
        agentData.level = ['L1', 'L2', 'L3'].includes(lv) ? lv : 'L1';
      }
      console.log('Sending agent data with skills:', agentData);
      const response = await fetch(buildApiUrl(`/api/agents/${editingAgent.id}`), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(agentData)
      });
      const data = await response.json();
      if (data.success) {
        setEditingAgent(null);
        fetchAgents();
        showSuccessNotification('Agent updated successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to update agent');
      }
    } catch (error) {
      console.error('Error updating agent:', error);
      showErrorNotification('Failed to update agent');
    }
  };

  // Start editing agent
  const handleStartEditAgent = async (agent) => {
    console.log('🎯 handleStartEditAgent called with:', agent);
    let freshAgent = agent;
    // Always fetch fresh agent data so skills are never stale
    try {
      const headers = getAuthHeaders();
      const url = buildApiUrl(`/api/agents/${agent.id}`);
      console.log('🎯 Fetching fresh agent from:', url);
      const res = await fetch(url, { headers });
      const json = await res.json();
      console.log('🎯 Fresh agent response:', json);
      if (json.success && json.data) {
        freshAgent = json.data;
      }
    } catch (e) {
      console.error('Error fetching fresh agent data:', e);
    }

    let additional_permissions = [];
    if (freshAgent.role === 'support_manager') {
      try {
        const headers = getAuthHeaders();
        const res = await fetch(buildApiUrl(`/api/departments/manager-permissions/${freshAgent.id}`), { headers });
        const json = await res.json();
        if (json.success) {
          additional_permissions = json.data;
        }
      } catch (e) {
        console.error('Error fetching manager permissions:', e);
      }
    }
    console.log('🎯 Setting editingAgent with skills:', freshAgent.skills);
    setEditingAgent({
      ...freshAgent,
      primary_department_id: freshAgent.primary_department_id || '',
      manager_id: freshAgent.manager_id || '',
      additional_permissions,
      skills: Array.isArray(freshAgent.skills) ? freshAgent.skills : []
    });
    setShowAddAgent(true);
  };

  // Delete agent
  const handleDeleteAgent = async (agentId) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) {
      showErrorNotification('Agent not found');
      return;
    }
    const confirmed = await confirmAction('Confirm Delete', `Are you sure you want to delete agent "${agent.name}"? This action cannot be undone.`);
    if (!confirmed) return;
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/agents/${agentId}`), {
        method: 'DELETE',
        headers
      });
      const data = await response.json();
      if (data.success) {
        fetchAgents();
        showSuccessNotification('Agent deleted successfully!');
      } else {
        showErrorNotification(data.message || 'Failed to delete agent');
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      showErrorNotification('Failed to delete agent');
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      [
        'userData',
        'userToken',
        'tickUser',
        'token',
        'autoLoginContext',
        'agentData',
        'agentToken',
        'access_token',
        'user_id',
        'user_name',
        'user_email',
        'user_role',
        'is_logged_in',
        'session_expires',
        'login_timestamp',
        'remembered_login_id',
        'remembered_password'
      ].forEach((k) => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      });
      navigate('/login');
    }
  };

  const formatDate = (dateString) =>
    formatDateTimeIST(dateString, { hour: undefined, minute: undefined });

  const statusNorm = (s) => String(s || '').trim().toLowerCase();

  const getTicketsByStatus = (status) => {
    const want = statusNorm(status);
    return tickets.filter((ticket) => statusNorm(ticket.status) === want);
  };

  // CEO Assignments view: show latest 20 active assigned tickets (most recent activity first).
  const activeAssignmentsList = () =>
    tickets
      .filter((t) => t.assigned_to && statusNorm(t.status) !== 'closed')
      .sort((a, b) => (ticketActivityMs(b) - ticketActivityMs(a)) || (Number(b.id) - Number(a.id)))
      .slice(0, 20);

  const ceoStatusKey = (ticket) => statusNorm(ticket?.status) || 'unknown';

  const formatCeoStatusLabel = (ticket) => {
    const k = ceoStatusKey(ticket);
    const labels = {
      new: 'New',
      in_progress: 'In progress',
      resolved: 'Resolved',
      escalated: 'Escalated',
      closed: 'Closed'
    };
    return labels[k] || (k ? k.replace(/_/g, ' ') : '—');
  };

  const openCeoTicket = (ticketId) => navigate(`/ticket/${ticketId}`);

  const getCeoExecutiveFilteredTickets = () => {
    if (!executiveTicketFilter) return [];
    switch (executiveTicketFilter) {
      case 'all':
        return tickets;
      case 'closed':
        return getTicketsByStatus('closed');
      case 'new':
        return getTicketsByStatus('new');
      case 'in_progress':
        return [...getTicketsByStatus('in_progress'), ...getTicketsByStatus('resolved')];
      case 'escalated':
        return getTicketsByStatus('escalated');
      default:
        return [];
    }
  };

  const executiveTicketListTitle =
    executiveTicketFilter === 'all'
      ? 'All tickets'
      : executiveTicketFilter === 'closed'
        ? 'Closed tickets'
        : executiveTicketFilter === 'new'
          ? 'New tickets'
          : executiveTicketFilter === 'in_progress'
            ? 'In progress & resolved tickets'
            : executiveTicketFilter === 'escalated'
              ? 'Escalated tickets'
              : 'Tickets';

  const goToCeoExecutiveTicketList = (filter) => {
    setExecutiveTicketFilter(filter);
    setActiveTab('executive');
  };

  const ceoKpiCardProps = (filter, colorMod) => ({
    className: `adr-kpi ${colorMod} adr-kpi--clickable`,
    role: 'button',
    tabIndex: 0,
    onClick: () => goToCeoExecutiveTicketList(filter),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToCeoExecutiveTicketList(filter);
      }
    }
  });

  const navUnreadCounts = useMemo(() => {
    const empty = { assignments: 0 };
    if (!tabLastSeenMs) return empty;
    const seen = tabLastSeenMs.assignments;
    if (typeof seen !== 'number' || !Number.isFinite(seen)) return empty;
    const n = activeAssignmentsList().filter((t) => ticketActivityMs(t) > seen).length;
    return { assignments: n };
  }, [tickets, tabLastSeenMs]);

  const tabList = [
    { key: 'executive', label: 'Overview', icon: 'executive', trackUnread: false },
    { key: 'products', label: 'Products & SLA', icon: 'strategic', trackUnread: false },
    { key: 'departments', label: 'Departments', icon: 'departments', trackUnread: false },
    { key: 'agents', label: 'Agents', icon: 'agents', trackUnread: false },
    { key: 'feedback', label: 'Feedback Insights', icon: 'feedback', trackUnread: false },
    { key: 'assignments', label: 'Assignments', icon: 'assignments', trackUnread: true },
    { key: 'trends', label: 'Trends', icon: 'trends', trackUnread: false },
    { key: 'strategic', label: 'Strategic', icon: 'strategic', trackUnread: false }
  ];

  const welcomeLabel = (ceo?.name || '').trim() || 'CEO';
  const resolutionRate =
    executiveMetrics.totalTickets > 0
      ? Math.round((executiveMetrics.resolvedTickets / executiveMetrics.totalTickets) * 100)
      : 0;

  if (loading) {
    return (
      <div className="ceo-dashboard ceo-dashboard-ref adr-loading-screen">
        <div className="adr-loading-spinner" aria-hidden />
        <p className="adr-loading-text">Loading executive dashboard…</p>
      </div>
    );
  }

  return (
    <div className="ceo-dashboard ceo-dashboard-ref">
      <header className="adr-header">
        <div className="adr-header__inner">
          <div className="adr-header__left">
            <div className="adr-header__text">
              <h1 className="adr-header__title">CEO dashboard</h1>
              <p className="adr-header__welcome">Welcome, {welcomeLabel}</p>
              <p className="adr-header__email">{ceo?.email || 'No email available'}</p>
            </div>
          </div>
          <div className="adr-header__actions">
            {error ? (
              <span style={{ color: '#dc2626', fontSize: '0.875rem', maxWidth: 280 }}>{error}</span>
            ) : null}
            <button
              type="button"
              className="adr-btn adr-btn--ghost"
              onClick={() => navigate('/faq-admin')}
            >
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              FAQ admin
            </button>
            <button
              type="button"
              className="adr-btn adr-btn--ghost"
              onClick={() => fetchExecutiveData(true)}
              disabled={isRefreshing}
            >
              <svg className="adr-btn__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M23 4v6h-6M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <HeaderNotificationBell />
            <button type="button" className="adr-btn adr-btn--ghost adr-btn--logout" onClick={handleLogout}>
              <svg className="adr-btn__icon adr-btn__icon--danger" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="adr-shell">
        <nav className="adr-sidebar" aria-label="Executive workspace">
          <div className="adr-sidebar__title">Workspace</div>
          {tabList.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-tab={tab.key}
              className={`adr-nav-row${activeTab === tab.key ? ' adr-nav-row--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className={`adr-nav-icon adr-nav-icon--${tab.icon}`}>
                <CeoSidebarIcon name={tab.icon} />
              </span>
              <span className="adr-nav-label">{tab.label}</span>
              {tab.trackUnread && navUnreadCounts[tab.key] > 0 ? (
                <span className="adr-nav-badge">{navUnreadCounts[tab.key]}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <main className="adr-main">
          {/* Success notification */}
          {showSuccess && (
            <div className="adr-notification adr-notification--success">
              {successMessage}
            </div>
          )}

          {/* Error notification */}
          {showError && (
            <div className="adr-notification adr-notification--error">
              {errorMessage}
            </div>
          )}

          {activeTab === 'executive' &&
            (executiveTicketFilter ? (
              <div className="ceo-panel">
                <div className="ceo-section-head" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: '100%' }}>
                    <button type="button" className="adr-btn adr-btn--ghost" onClick={() => setExecutiveTicketFilter(null)}>
                      ← Executive overview
                    </button>
                    <h2 style={{ margin: '10px 0 6px', fontSize: '1.35rem', fontWeight: 700 }}>{executiveTicketListTitle}</h2>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '0.9rem' }}>
                      {getCeoExecutiveFilteredTickets().length} ticket(s) · newest first
                    </p>
                  </div>
                </div>
                <div className="ceo-data-table-wrap">
                  <table className="ceo-data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Issue</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...getCeoExecutiveFilteredTickets()]
                        .sort((a, b) => (ticketActivityMs(b) - ticketActivityMs(a)) || (Number(b.id) - Number(a.id)))
                        .map((ticket) => (
                          <tr key={ticket.id}>
                            <td>#{ticket.id}</td>
                            <td>{ticket.issue_title || (ticket.description ? `${String(ticket.description).slice(0, 60)}…` : '—')}</td>
                            <td>
                              <span className={`adr-status-pill adr-status-pill--${ceoStatusKey(ticket)}`}>
                                {formatCeoStatusLabel(ticket)}
                              </span>
                            </td>
                            <td>{formatDate(ticket.created_at)}</td>
                            <td>
                              <button type="button" className="adr-table-view-btn" onClick={() => openCeoTicket(ticket.id)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {getCeoExecutiveFilteredTickets().length === 0 ? (
                    <div className="ceo-empty">No tickets in this view.</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="adr-dashboard">
                <div className="adr-dashboard__head">
                  <h2 className="adr-dashboard__title">Executive overview</h2>
                  <p className="adr-dashboard__sub">
                    Tenant-wide ticket metrics
                    {lastUpdated ? (
                      <span style={{ display: 'block', marginTop: 6, fontSize: '0.8125rem', color: '#9ca3af' }}>
                        Last updated {formatDateTimeIST(lastUpdated)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="adr-kpi-row">
                  <article {...ceoKpiCardProps('all', 'adr-kpi--purple')} title="View all tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="overview" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{executiveMetrics.totalTickets}</span>
                      <span className="adr-kpi__label">Total tickets</span>
                    </div>
                  </article>
                  <article {...ceoKpiCardProps('closed', 'adr-kpi--green')} title="View closed tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="closed" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{executiveMetrics.resolvedTickets}</span>
                      <span className="adr-kpi__label">Resolved</span>
                    </div>
                  </article>
                  <article
                    className="adr-kpi adr-kpi--blue adr-kpi--clickable"
                    role="button"
                    tabIndex={0}
                    title="View trends & analytics"
                    onClick={() => setActiveTab('trends')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTab('trends');
                      }
                    }}
                  >
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="new" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{resolutionRate}%</span>
                      <span className="adr-kpi__label">Resolution rate</span>
                    </div>
                  </article>
                  <article
                    className="adr-kpi adr-kpi--amber adr-kpi--clickable"
                    role="button"
                    tabIndex={0}
                    title="View trends & analytics"
                    onClick={() => setActiveTab('trends')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTab('trends');
                      }
                    }}
                  >
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="in_progress_kpi" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{executiveMetrics.avgResolutionTime}h</span>
                      <span className="adr-kpi__label">Avg resolution (est.)</span>
                    </div>
                  </article>
                </div>
                <div className="adr-kpi-row" style={{ marginTop: 16 }}>
                  <article {...ceoKpiCardProps('escalated', 'adr-kpi--purple')} title="View escalated tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="escalated" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{getTicketsByStatus('escalated').length}</span>
                      <span className="adr-kpi__label">Escalated</span>
                    </div>
                  </article>
                  <article {...ceoKpiCardProps('in_progress', 'adr-kpi--blue')} title="View in progress and resolved tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="in_progress_kpi" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">
                        {getTicketsByStatus('in_progress').length + getTicketsByStatus('resolved').length}
                      </span>
                      <span className="adr-kpi__label">In progress / resolved</span>
                    </div>
                  </article>
                  <article {...ceoKpiCardProps('new', 'adr-kpi--green')} title="View new tickets">
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="new" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{getTicketsByStatus('new').length}</span>
                      <span className="adr-kpi__label">New</span>
                    </div>
                  </article>
                  <article
                    className="adr-kpi adr-kpi--amber adr-kpi--clickable"
                    role="button"
                    tabIndex={0}
                    title="Open feedback insights"
                    onClick={() => setActiveTab('feedback')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTab('feedback');
                      }
                    }}
                  >
                    <div className="adr-kpi__icon-wrap">
                      <MdashKpiIcon name="overview" />
                    </div>
                    <div className="adr-kpi__body">
                      <span className="adr-kpi__num">{executiveMetrics.customerSatisfaction || '—'}</span>
                      <span className="adr-kpi__label">Satisfaction (avg.)</span>
                    </div>
                  </article>
                </div>
              </div>
            ))}

          {activeTab === 'products' && (
            <div className="ceo-panel">
              <div className="ceo-section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>Product Management</h2>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>Manage products, SLA settings, and team agents</p>
                </div>
                <button
                  type="button"
                  className="adr-btn adr-btn--primary"
                  onClick={() => {
                    setEditingProduct(null);
                    setShowAddProduct(true);
                  }}
                  style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                >
                  + Add Product
                </button>
              </div>
              <div style={{ marginBottom: '24px', padding: '16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>Select Product to View Details:</label>
                <select
                  value={selectedProduct?.id ? String(selectedProduct.id) : ''}
                  onChange={(e) => {
                    const productId = e.target.value;
                    const product = products.find(p => String(p.id) === productId);
                    setSelectedProduct(product);
                    if (product) {
                      fetchModules(product.id);
                      fetchSLAConfigurations(product.id);
                    }
                  }}
                  style={{ width: '100%', maxWidth: '400px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.95rem', color: '#1e293b', background: '#ffffff' }}
                >
                  <option value="">-- Select a product to view modules, SLA configurations, and performance --</option>
                  {products.map((product) => (
                    <option key={product.id} value={String(product.id)}>{product.name}</option>
                  ))}
                </select>
              </div>
              {showAddProduct && (
                <div className="ceo-modal-overlay" onClick={() => setShowAddProduct(false)}>
                  <div className="ceo-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="ceo-modal-header">
                      <h3>{editingProduct ? 'Edit Product' : '+ Add New Product'}</h3>
                      <button type="button" className="ceo-modal-close" onClick={() => setShowAddProduct(false)}>×</button>
                    </div>
                    <form onSubmit={editingProduct ? handleEditProduct : handleAddProduct}>
                    <div className="ceo-form-group">
                      <label>Product Name *</label>
                      <input
                        type="text"
                        value={editingProduct ? editingProduct.name : newProduct.name}
                        onChange={(e) => editingProduct 
                          ? setEditingProduct({ ...editingProduct, name: e.target.value })
                          : setNewProduct({ ...newProduct, name: e.target.value })}
                        placeholder="e.g., Authentication System"
                        required
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>Description</label>
                      <textarea
                        value={editingProduct ? editingProduct.description : newProduct.description}
                        onChange={(e) => editingProduct 
                          ? setEditingProduct({ ...editingProduct, description: e.target.value })
                          : setNewProduct({ ...newProduct, description: e.target.value })}
                        placeholder="Product description..."
                        rows="3"
                      />
                    </div>
                    <div className="ceo-form-group">
                      <label>Status</label>
                      <select
                        value={editingProduct ? editingProduct.status : newProduct.status}
                        onChange={(e) => editingProduct 
                          ? setEditingProduct({ ...editingProduct, status: e.target.value })
                          : setNewProduct({ ...newProduct, status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="ceo-form-group">
                      <label>Priority Allocation Type</label>
                      <select
                        value={editingProduct ? editingProduct.priority_allocation_type : newProduct.priority_allocation_type}
                        onChange={(e) => editingProduct 
                          ? setEditingProduct({ ...editingProduct, priority_allocation_type: e.target.value })
                          : setNewProduct({ ...newProduct, priority_allocation_type: e.target.value })}
                      >
                        <option value="ai_only">AI Auto Allocation Only</option>
                        <option value="manual">Manual Allocation</option>
                        <option value="hybrid">Hybrid (AI + Manual)</option>
                      </select>
                    </div>
                    <div className="ceo-form-actions">
                      <button type="submit" className="adr-btn adr-btn--primary">
                        {editingProduct ? 'Save Changes' : 'Save Product'}
                      </button>
                      <button
                        type="button"
                        className="adr-btn adr-btn--ghost"
                        onClick={() => {
                          setShowAddProduct(false);
                          setEditingProduct(null);
                          setNewProduct({
                            name: '',
                            description: '',
                            status: 'active',
                            priority_allocation_type: 'ai_only'
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
                </div>
              )}
              <div className="ceo-product-table-wrap">
                <table className="ceo-product-table">
                  <thead>
                    <tr>
                      <th>PRODUCT NAME</th>
                      <th>STATUS</th>
                      <th>CREATED DATE</th>
                      <th style={{ textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td style={{ fontWeight: 500, color: '#111827' }}>{product.name}</td>
                        <td>
                          <span className={`ceo-status-badge ${product.status === 'active' ? 'ceo-status-badge--active' : 'ceo-status-badge--inactive'}`}>
                            {product.status?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ color: '#6b7280' }}>
                          {product.created_at ? new Date(product.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="ceo-action-btn ceo-action-btn--edit"
                            onClick={() => {
                              setEditingProduct({
                                ...product,
                                priority_allocation_type: product.priority_allocation_type || 'ai_only'
                              });
                              setShowAddProduct(true);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ceo-action-btn ceo-action-btn--delete"
                            onClick={() => handleDeleteProduct(product.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selectedProduct && (
                <div className="ceo-product-details" style={{ marginTop: '40px' }}>
                  <div className="ceo-subsection-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>Modules for {selectedProduct.name}</h3>
                    <button
                      type="button"
                      className="adr-btn adr-btn--primary"
                      onClick={() => {
                        setNewModule({ ...newModule, product_id: selectedProduct.id });
                        setShowAddModule(true);
                      }}
                      style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      + Add Module
                    </button>
                  </div>
                  {showAddModule && (
                    <div className="ceo-modal-overlay" onClick={() => setShowAddModule(false)}>
                      <div className="ceo-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ceo-modal-header">
                          <h3>{editingModule ? 'Edit Module' : '+ Add New Module'}</h3>
                          <button type="button" className="ceo-modal-close" onClick={() => setShowAddModule(false)}>×</button>
                        </div>
                        <form onSubmit={editingModule ? handleEditModule : handleAddModule}>
                        <div className="ceo-form-group">
                          <label>Module Name *</label>
                          <input
                            type="text"
                            value={editingModule ? editingModule.name : newModule.name}
                            onChange={(e) => editingModule 
                              ? setEditingModule({ ...editingModule, name: e.target.value })
                              : setNewModule({ ...newModule, name: e.target.value })}
                            placeholder="e.g., User Authentication"
                            required
                          />
                        </div>
                        <div className="ceo-form-group">
                          <label>Description</label>
                          <textarea
                            value={editingModule ? editingModule.description : newModule.description}
                            onChange={(e) => editingModule 
                              ? setEditingModule({ ...editingModule, description: e.target.value })
                              : setNewModule({ ...newModule, description: e.target.value })}
                            placeholder="Module description..."
                            rows="3"
                          />
                        </div>
                        <div className="ceo-form-group">
                          <label>Status</label>
                          <select
                            value={editingModule ? editingModule.status : newModule.status}
                            onChange={(e) => editingModule 
                              ? setEditingModule({ ...editingModule, status: e.target.value })
                              : setNewModule({ ...newModule, status: e.target.value })}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                        <div className="ceo-form-actions">
                          <button type="submit" className="adr-btn adr-btn--primary">
                            {editingModule ? 'Save Changes' : 'Save Module'}
                          </button>
                          <button
                            type="button"
                            className="adr-btn adr-btn--ghost"
                            onClick={() => {
                              setShowAddModule(false);
                              setEditingModule(null);
                              setNewModule({
                                product_id: '',
                                name: '',
                                description: '',
                                status: 'active'
                              });
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                    </div>
                  )}
                  {modules.length === 0 ? (
                    <div className="ceo-empty">
                      <p>🔧 No modules found for this product</p>
                      <p>Click the "+" button to add your first module</p>
                    </div>
                  ) : (
                    <table className="ceo-data-table">
                      <thead>
                        <tr>
                          <th>Module Name</th>
                          <th>Description</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((module) => (
                          <tr key={module.id}>
                            <td style={{ fontWeight: 600 }}>{module.name}</td>
                            <td>{module.description || '—'}</td>
                            <td>
                              <span className={`ceo-status-pill ${module.status === 'active' ? 'ceo-status-pill--ok' : 'ceo-status-pill--inactive'}`}>
                                {module.status === 'active' ? '✅ Active' : '❌ Inactive'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85em', color: '#6b7280' }}>
                              {module.created_at ? new Date(module.created_at).toLocaleDateString('en-IN', { 
                                day: '2-digit', 
                                month: 'short', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : '—'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="adr-btn adr-btn--ghost"
                                onClick={() => {
                                  setEditingModule(module);
                                  setShowAddModule(true);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="adr-btn adr-btn--ghost"
                                onClick={() => handleDeleteModule(module.id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {selectedProduct && (
                    <>
                  <div className="ceo-subsection-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
                      SLA Configurations for {selectedProduct.name}
                    </h3>
                    <button
                      type="button"
                      className="adr-btn adr-btn--primary"
                      onClick={() => {
                        const pid = selectedProduct?.id;
                        setNewSLA({ ...newSLA, product_id: pid });
                        if (pid) fetchModules(pid);
                        setShowAddSLA(true);
                      }}
                      style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}
                    >
                      + Add SLA Configuration
                    </button>
                  </div>
                  {showAddSLA && (
                    <div className="ceo-modal-overlay" onClick={() => setShowAddSLA(false)}>
                      <div className="ceo-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ceo-modal-header">
                          <h3>{editingSLA ? 'Edit SLA Rule' : '+ Add New SLA Rule'}</h3>
                          <button type="button" className="ceo-modal-close" onClick={() => setShowAddSLA(false)}>×</button>
                        </div>
                        <form onSubmit={editingSLA ? handleEditSLA : handleAddSLA}>
                        <div className="ceo-form-group">
                          <label>Product *</label>
                          <select
                            value={editingSLA ? editingSLA.product_id : newSLA.product_id}
                            onChange={(e) => {
                              const productId = e.target.value;
                              if (editingSLA) {
                                setEditingSLA({ ...editingSLA, product_id: productId, module_id: '' });
                              } else {
                                setNewSLA({ ...newSLA, product_id: productId, module_id: '' });
                              }
                              // Fetch modules for selected product
                              if (productId) {
                                fetchModules(productId);
                              }
                            }}
                            required
                          >
                            <option value="">Select Product</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="ceo-form-group">
                          <label>Module *</label>
                          <select
                            value={editingSLA ? editingSLA.module_id : newSLA.module_id}
                            onChange={(e) => editingSLA 
                              ? setEditingSLA({ ...editingSLA, module_id: e.target.value })
                              : setNewSLA({ ...newSLA, module_id: e.target.value })}
                            required
                            disabled={!((editingSLA ? editingSLA.product_id : newSLA.product_id))}
                          >
                            <option value="">Select Module</option>
                            {modules.filter(m => String(m.product_id) === String(editingSLA ? editingSLA.product_id : newSLA.product_id)).map((module) => (
                              <option key={module.id} value={module.id}>{module.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="ceo-form-group">
                          <label>Issue Type *</label>
                          <input
                            type="text"
                            value={editingSLA ? editingSLA.issue_name : newSLA.issue_name}
                            onChange={(e) => editingSLA 
                              ? setEditingSLA({ ...editingSLA, issue_name: e.target.value })
                              : setNewSLA({ ...newSLA, issue_name: e.target.value })}
                            placeholder="e.g., Login Issues"
                            required
                          />
                        </div>
                        <div className="ceo-form-row">
                          <div className="ceo-form-group">
                            <label>Response Time (minutes) *</label>
                            <input
                              type="number"
                              value={editingSLA ? editingSLA.response_time_minutes : newSLA.response_time_minutes}
                              onChange={(e) => editingSLA 
                                ? setEditingSLA({ ...editingSLA, response_time_minutes: parseInt(e.target.value) })
                                : setNewSLA({ ...newSLA, response_time_minutes: parseInt(e.target.value) })}
                              min="5"
                              max="1440"
                              required
                            />
                          </div>
                          <div className="ceo-form-group">
                            <label>Resolution Time (minutes) *</label>
                            <input
                              type="number"
                              value={editingSLA ? editingSLA.resolution_time_minutes : newSLA.resolution_time_minutes}
                              onChange={(e) => editingSLA 
                                ? setEditingSLA({ ...editingSLA, resolution_time_minutes: parseInt(e.target.value) })
                                : setNewSLA({ ...newSLA, resolution_time_minutes: parseInt(e.target.value) })}
                              min="5"
                              max="1440"
                              required
                            />
                          </div>
                        </div>
                        <div className="ceo-form-group">
                          <label>Description</label>
                          <textarea
                            value={editingSLA ? (editingSLA.issue_description || '') : newSLA.issue_description}
                            onChange={(e) => editingSLA 
                              ? setEditingSLA({ ...editingSLA, issue_description: e.target.value })
                              : setNewSLA({ ...newSLA, issue_description: e.target.value })}
                            placeholder="SLA rule description..."
                            rows="3"
                          />
                        </div>
                        <div className="ceo-form-group">
                          <label>Status</label>
                          <select
                            value={editingSLA ? (editingSLA.is_active ? 'active' : 'inactive') : (newSLA.is_active ? 'active' : 'inactive')}
                            onChange={(e) => editingSLA 
                              ? setEditingSLA({ ...editingSLA, is_active: e.target.value === 'active' })
                              : setNewSLA({ ...newSLA, is_active: e.target.value === 'active' })}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                        <div className="ceo-form-actions">
                          <button type="submit" className="adr-btn adr-btn--primary">
                            {editingSLA ? 'Save Changes' : 'Save SLA Rule'}
                          </button>
                          <button
                            type="button"
                            className="adr-btn adr-btn--ghost"
                            onClick={() => {
                              setShowAddSLA(false);
                              setEditingSLA(null);
                              setNewSLA({
                                product_id: '',
                                module_id: '',
                                issue_name: '',
                                response_time_minutes: 480,
                                resolution_time_minutes: 960,
                                issue_description: '',
                                is_active: true
                              });
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                    </div>
                  )}
                  {slaConfigurations.length === 0 ? (
                    <p>No SLA configurations for this product.</p>
                  ) : (
                    <table className="ceo-data-table">
                      <thead>
                        <tr>
                          <th>Issue Name</th>
                          <th>Response Time</th>
                          <th>Resolution Time</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slaConfigurations.map((sla) => (
                          <tr key={sla.id}>
                            <td>{sla.issue_name}</td>
                            <td>{sla.response_time_minutes} min</td>
                            <td>{sla.resolution_time_minutes} min</td>
                            <td>
                              <span className={`ceo-status-pill ${sla.is_active ? 'ceo-status-pill--ok' : 'ceo-status-pill--inactive'}`}>
                                {sla.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85em', color: '#6b7280' }}>
                              {sla.created_at ? new Date(sla.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : '—'}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="adr-btn adr-btn--ghost"
                                onClick={() => {
                                  setEditingSLA(sla);
                                  setNewSLA({
                                    product_id: sla.product_id,
                                    module_id: sla.module_id,
                                    issue_name: sla.issue_name,
                                    response_time_minutes: sla.response_time_minutes,
                                    resolution_time_minutes: sla.resolution_time_minutes,
                                    issue_description: sla.issue_description || '',
                                    is_active: sla.is_active
                                  });
                                  if (sla.product_id) fetchModules(sla.product_id);
                                  setShowAddSLA(true);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="adr-btn adr-btn--ghost"
                                onClick={() => handleDeleteSLA(sla.id)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="ceo-subsection-head" style={{ marginTop: '40px', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>SLA Performance Averages</h3>
                  </div>
                  {slaPerformance.length === 0 ? (
                    <p style={{ color: '#6b7280', padding: '20px 0' }}>No performance data available yet. Performance metrics will appear once tickets are resolved with SLA configurations.</p>
                  ) : (
                    <table className="ceo-data-table">
                      <thead>
                        <tr>
                          <th>PRODUCT</th>
                          <th>MODULE</th>
                          <th>ISSUE TYPE</th>
                          <th>RESPONSE TIME PERFORMANCE RATE</th>
                          <th>RESOLUTION TIME PERFORMANCE RATE</th>
                          <th>OVERALL PERFORMANCE RATE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slaPerformance.map((perf) => (
                          <tr key={perf.id}>
                            <td>{perf.product_name || 'N/A'}</td>
                            <td>{perf.module_name || 'N/A'}</td>
                            <td>{perf.issue_name}</td>
                            <td>
                              <span className={`ceo-status-pill ${perf.response_time_performance_rate != null ? (perf.response_time_performance_rate <= 100 ? 'ceo-status-pill--ok' : 'ceo-status-pill--low') : ''}`}>
                                {perf.response_time_performance_rate != null ? Math.round(perf.response_time_performance_rate) + '%' : '0%'}
                              </span>
                            </td>
                            <td>
                              <span className={`ceo-status-pill ${perf.resolution_time_performance_rate != null ? (perf.resolution_time_performance_rate <= 100 ? 'ceo-status-pill--ok' : 'ceo-status-pill--low') : ''}`}>
                                {perf.resolution_time_performance_rate != null ? Math.round(perf.resolution_time_performance_rate) + '%' : '0%'}
                              </span>
                            </td>
                            <td>
                              <span className={`ceo-status-pill ${perf.overall_performance_rate != null ? (perf.overall_performance_rate <= 100 ? 'ceo-status-pill--ok' : 'ceo-status-pill--low') : ''}`}>
                                {perf.overall_performance_rate != null ? Math.round(perf.overall_performance_rate) + '%' : '0%'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  </>
                )}
              </div>
              )}
            </div>
          )}


          {activeTab === 'departments' && (
            <div className="ceo-panel">
              <div className="ceo-section-head">
                <h2>Department performance</h2>
                <p>Ticket load and resolution by department</p>
              </div>
              <div className="ceo-dept-grid">
                {executiveMetrics.departmentPerformance.map((dept) => (
                  <div key={dept.id} className="ceo-dept-card">
                    <h4>{dept.department}</h4>
                    <div className="ceo-dept-manager">Manager: {dept.name}</div>
                    <div className="ceo-dept-metrics">
                      <div className="ceo-dept-metric">
                        <span>Total</span>
                        <span>{dept.totalTickets}</span>
                      </div>
                      <div className="ceo-dept-metric">
                        <span>Resolved</span>
                        <span>{dept.resolvedTickets}</span>
                      </div>
                      <div className="ceo-dept-metric">
                        <span>Success %</span>
                        <span>
                          {dept.totalTickets > 0
                            ? Math.round((dept.resolvedTickets / dept.totalTickets) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="ceo-dept-metric">
                        <span>Avg time</span>
                        <span>{dept.avgResolutionTime}h</span>
                      </div>
                    </div>
                    <div>
                      {dept.totalTickets > 0 && dept.resolvedTickets / dept.totalTickets >= 0.8 ? (
                        <span className="ceo-status-pill ceo-status-pill--ok">Strong</span>
                      ) : dept.totalTickets > 0 && dept.resolvedTickets / dept.totalTickets >= 0.6 ? (
                        <span className="ceo-status-pill ceo-status-pill--mid">On track</span>
                      ) : (
                        <span className="ceo-status-pill ceo-status-pill--low">Needs focus</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="ceo-panel">
              <div className="ceo-section-head">
                <h2>👨‍💼 Agent Management</h2>
                <p>Create staff accounts with auto-generated login credentials</p>
                <button
                  type="button"
                  className="adr-btn adr-btn--primary"
                  onClick={() => {
                    setEditingAgent(null);
                    setShowAddAgent(true);
                  }}
                >
                  + Add Staff Member
                </button>
              </div>
              {showAddAgent && (
                <div className="ceo-modal-overlay" onClick={() => setShowAddAgent(false)}>
                  <div className="ceo-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="ceo-modal-header">
                      <h3>{editingAgent ? 'Edit Agent' : '+ Add New Agent'}</h3>
                      <button type="button" className="ceo-modal-close" onClick={() => setShowAddAgent(false)}>×</button>
                    </div>
                    <form onSubmit={editingAgent ? handleEditAgent : handleAddAgent}>
                    <div className="ceo-form-row">
                      <div className="ceo-form-group">
                        <label>Full Name * (minimum 2 characters)</label>
                        <input
                          type="text"
                          value={editingAgent ? editingAgent.name : newAgent.name}
                          onChange={(e) => editingAgent 
                            ? setEditingAgent({ ...editingAgent, name: e.target.value })
                            : setNewAgent({ ...newAgent, name: e.target.value })}
                          placeholder="Enter full name (minimum 2 characters)"
                          required
                          minLength={2}
                        />
                        {(editingAgent ? editingAgent.name : newAgent.name) && 
                         (editingAgent ? editingAgent.name : newAgent.name).trim().length < 2 && (
                          <small style={{color: 'red'}}>
                            Name must be at least 2 characters long
                          </small>
                        )}
                      </div>
                      <div className="ceo-form-group">
                        <label>Email Address *</label>
                        <input
                          type="email"
                          value={editingAgent ? editingAgent.email : newAgent.email}
                          onChange={(e) => editingAgent 
                            ? setEditingAgent({ ...editingAgent, email: e.target.value })
                            : setNewAgent({ ...newAgent, email: e.target.value })}
                          placeholder="Enter email address"
                          required
                        />
                        {(editingAgent ? editingAgent.email : newAgent.email) && 
                         !(editingAgent ? editingAgent.email : newAgent.email).includes('@') && (
                          <small style={{color: 'red'}}>
                            Please enter a valid email address
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="ceo-form-group">
                      <label>Role *</label>
                      <select
                        value={editingAgent ? editingAgent.role : newAgent.role}
                        onChange={(e) => editingAgent 
                          ? setEditingAgent({ ...editingAgent, role: e.target.value })
                          : setNewAgent({ ...newAgent, role: e.target.value })}
                        className="ceo-form-select"
                        required
                      >
                        <option value="support_agent">Support Executive (Agent)</option>
                        <option value="support_manager">Support Manager</option>
                      </select>
                    </div>
                    {(editingAgent ? editingAgent.role : newAgent.role) === 'support_manager' && (
                    <div className="ceo-form-group">
                      <label>Primary Department *</label>
                      <select
                        value={editingAgent ? editingAgent.primary_department_id : newAgent.primary_department_id}
                        onChange={(e) => editingAgent
                          ? setEditingAgent({ ...editingAgent, primary_department_id: e.target.value })
                          : setNewAgent({ ...newAgent, primary_department_id: e.target.value })}
                        className="ceo-form-select"
                        required
                      >
                        <option value="">Select Department</option>
                        {departmentsForAgents.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    )}
                    {(editingAgent ? editingAgent.role : newAgent.role) === 'support_agent' && (
                      <>
                        <div className="ceo-form-group">
                          <label>Support level *</label>
                          <select
                            value={editingAgent ? editingAgent.level : newAgent.level}
                            onChange={(e) => editingAgent 
                              ? setEditingAgent({ ...editingAgent, level: e.target.value })
                              : setNewAgent({ ...newAgent, level: e.target.value })}
                            className="ceo-form-select"
                          >
                            <option value="L1">L1 — First line</option>
                            <option value="L2">L2 — Second line</option>
                            <option value="L3">L3 — Third line</option>
                          </select>
                        </div>
                        <div className="ceo-form-group">
                          <label>Reporting Manager</label>
                          <select
                            value={editingAgent ? editingAgent.manager_id : newAgent.manager_id}
                            onChange={(e) => {
                              const selectedManagerId = e.target.value;
                              const selectedManager = agents.find(a => a.id === Number(selectedManagerId));
                              const primaryDeptId = selectedManager?.primary_department_id || '';
                              if (editingAgent) {
                                setEditingAgent({ ...editingAgent, manager_id: selectedManagerId, primary_department_id: primaryDeptId });
                              } else {
                                setNewAgent({ ...newAgent, manager_id: selectedManagerId, primary_department_id: primaryDeptId });
                              }
                            }}
                            className="ceo-form-select"
                          >
                            <option value="">Select Manager (None)</option>
                            {agents.filter(a => a.role === 'support_manager' && a.id !== (editingAgent?.id)).map(mgr => (
                              <option key={mgr.id} value={mgr.id}>{mgr.name} - {mgr.department_name || 'No Department'}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    {(editingAgent ? editingAgent.role : newAgent.role) === 'support_agent' && (
                    <div className="ceo-form-group">
                      <label>Skills</label>
                      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        {(editingAgent ? editingAgent.skills : newAgent.skills).length === 0 && (
                          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '10px' }}>No skills added yet</p>
                        )}
                        {(editingAgent ? editingAgent.skills : newAgent.skills).map((skill, index) => (
                          <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', marginBottom: '10px', alignItems: 'end' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Domain</label>
                              <select
                                value={skill.domain}
                                onChange={(e) => {
                                  const updatedSkills = [...(editingAgent ? editingAgent.skills : newAgent.skills)];
                                  updatedSkills[index] = { ...skill, domain: e.target.value, sub_skill: '' };
                                  if (editingAgent) {
                                    setEditingAgent({ ...editingAgent, skills: updatedSkills });
                                  } else {
                                    setNewAgent({ ...newAgent, skills: updatedSkills });
                                  }
                                }}
                                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                              >
                                <option value="">Select Domain</option>
                                <option value="Technical">Technical</option>
                                <option value="Customer Service">Customer Service</option>
                                <option value="Process">Process</option>
                                <option value="Product">Product</option>
                                <option value="Development">Development</option>
                                <option value="Testing">Testing</option>
                                <option value="Deployment">Deployment</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Sub-skill</label>
                              <select
                                value={skill.sub_skill || ''}
                                onChange={(e) => {
                                  const updatedSkills = [...(editingAgent ? editingAgent.skills : newAgent.skills)];
                                  updatedSkills[index] = { ...skill, sub_skill: e.target.value };
                                  if (editingAgent) {
                                    setEditingAgent({ ...editingAgent, skills: updatedSkills });
                                  } else {
                                    setNewAgent({ ...newAgent, skills: updatedSkills });
                                  }
                                }}
                                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                              >
                                <option value="">Select Sub-skill</option>
                                {skill.domain === 'Technical' && (
                                  <>
                                    <option value="Networking">Networking</option>
                                    <option value="Database">Database</option>
                                    <option value="Security">Security</option>
                                    <option value="Cloud">Cloud</option>
                                  </>
                                )}
                                {skill.domain === 'Customer Service' && (
                                  <>
                                    <option value="Communication">Communication</option>
                                    <option value="Problem Solving">Problem Solving</option>
                                    <option value="Empathy">Empathy</option>
                                  </>
                                )}
                                {skill.domain === 'Process' && (
                                  <>
                                    <option value="ITIL">ITIL</option>
                                    <option value="Agile">Agile</option>
                                    <option value="Scrum">Scrum</option>
                                  </>
                                )}
                                {skill.domain === 'Product' && (
                                  <>
                                    <option value="Authentication">Authentication</option>
                                    <option value="Billing">Billing</option>
                                    <option value="Reporting">Reporting</option>
                                  </>
                                )}
                                {skill.domain === 'Development' && (
                                  <>
                                    <option value="Frontend">Frontend</option>
                                    <option value="Backend">Backend</option>
                                    <option value="Full Stack">Full Stack</option>
                                    <option value="Mobile">Mobile</option>
                                  </>
                                )}
                                {skill.domain === 'Testing' && (
                                  <>
                                    <option value="Manual Testing">Manual Testing</option>
                                    <option value="Automation">Automation</option>
                                    <option value="Performance Testing">Performance Testing</option>
                                    <option value="Security Testing">Security Testing</option>
                                  </>
                                )}
                                {skill.domain === 'Deployment' && (
                                  <>
                                    <option value="CI/CD">CI/CD</option>
                                    <option value="DevOps">DevOps</option>
                                    <option value="Infrastructure">Infrastructure</option>
                                    <option value="Monitoring">Monitoring</option>
                                  </>
                                )}
                                {/* Fallback for any sub-skill that doesn't match predefined options */}
                                {skill.sub_skill && !['Networking','Database','Security','Cloud','Communication','Problem Solving','Empathy','ITIL','Agile','Scrum','Authentication','Billing','Reporting','Frontend','Backend','Full Stack','Mobile','Manual Testing','Automation','Performance Testing','Security Testing','CI/CD','DevOps','Infrastructure','Monitoring'].includes(skill.sub_skill) && (
                                  <option value={skill.sub_skill}>{skill.sub_skill}</option>
                                )}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px', display: 'block' }}>Proficiency</label>
                              <select
                                value={skill.proficiency}
                                onChange={(e) => {
                                  const updatedSkills = [...(editingAgent ? editingAgent.skills : newAgent.skills)];
                                  updatedSkills[index] = { ...skill, proficiency: e.target.value };
                                  if (editingAgent) {
                                    setEditingAgent({ ...editingAgent, skills: updatedSkills });
                                  } else {
                                    setNewAgent({ ...newAgent, skills: updatedSkills });
                                  }
                                }}
                                style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                              >
                                <option value="Beginner">Beginner</option>
                                <option value="Intermediate">Intermediate</option>
                                <option value="Advanced">Advanced</option>
                                <option value="Expert">Expert</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updatedSkills = (editingAgent ? editingAgent.skills : newAgent.skills).filter((_, i) => i !== index);
                                if (editingAgent) {
                                  setEditingAgent({ ...editingAgent, skills: updatedSkills });
                                } else {
                                  setNewAgent({ ...newAgent, skills: updatedSkills });
                                }
                              }}
                              style={{ padding: '8px 12px', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const newSkill = { domain: '', sub_skill: '', proficiency: 'Beginner' };
                            if (editingAgent) {
                              setEditingAgent({ ...editingAgent, skills: [...(editingAgent.skills || []), newSkill] });
                            } else {
                              setNewAgent({ ...newAgent, skills: [...(newAgent.skills || []), newSkill] });
                            }
                          }}
                          style={{ padding: '8px 16px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          + Add Skill
                        </button>
                      </div>
                    </div>
                    )}
                    {(editingAgent ? editingAgent.role : newAgent.role) === 'support_manager' && (
                      <div className="ceo-permissions-grid" style={{ margin: '15px 0', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 5px 0' }}>Additional Department Permissions</h4>
                        <p style={{ fontSize: '0.85em', color: '#64748b', margin: '0 0 15px 0' }}>Configure override permission matrices for other departments.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                          {departmentsForAgents.filter(d => d.id !== Number(editingAgent ? editingAgent.primary_department_id : newAgent.primary_department_id)).map(dept => {
                            const perm = (editingAgent ? editingAgent.additional_permissions : newAgent.additional_permissions).find(p => p.department_id === dept.id) || {
                              department_id: dept.id,
                              can_view: 0,
                              can_update: 0,
                              can_assign: 0,
                              can_close: 0,
                              can_view_reports: 0,
                              can_manage_escalations: 0
                            };
                            const togglePermission = (field) => {
                              const existingIndex = (editingAgent ? editingAgent.additional_permissions : newAgent.additional_permissions).findIndex(p => p.department_id === dept.id);
                              let updatedPermissions = [...(editingAgent ? editingAgent.additional_permissions : newAgent.additional_permissions)];
                              if (existingIndex > -1) {
                                const updatedPerm = { ...updatedPermissions[existingIndex] };
                                updatedPerm[field] = updatedPerm[field] ? 0 : 1;
                                updatedPermissions[existingIndex] = updatedPerm;
                              } else {
                                const newPerm = {
                                  department_id: dept.id,
                                  can_view: 0,
                                  can_update: 0,
                                  can_assign: 0,
                                  can_close: 0,
                                  can_view_reports: 0,
                                  can_manage_escalations: 0
                                };
                                newPerm[field] = 1;
                                updatedPermissions.push(newPerm);
                              }
                              if (editingAgent) {
                                setEditingAgent({ ...editingAgent, additional_permissions: updatedPermissions });
                              } else {
                                setNewAgent({ ...newAgent, additional_permissions: updatedPermissions });
                              }
                            };
                            return (
                              <div key={dept.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <strong style={{ display: 'block', marginBottom: '8px', color: '#1e293b' }}>{dept.name} Department</strong>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    <input type="checkbox" checked={!!perm.can_view} onChange={() => togglePermission('can_view')} />
                                    View Tickets
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    <input type="checkbox" checked={!!perm.can_update} onChange={() => togglePermission('can_update')} />
                                    Update Tickets
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    <input type="checkbox" checked={!!perm.can_assign} onChange={() => togglePermission('can_assign')} />
                                    Assign Tickets
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    <input type="checkbox" checked={!!perm.can_close} onChange={() => togglePermission('can_close')} />
                                    Close Tickets
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    <input type="checkbox" checked={!!perm.can_view_reports} onChange={() => togglePermission('can_view_reports')} />
                                    View Reports
                                  </label>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9em' }}>
                                    <input type="checkbox" checked={!!perm.can_manage_escalations} onChange={() => togglePermission('can_manage_escalations')} />
                                    Escalation Access
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {editingAgent && (
                      <div className="ceo-form-group">
                        <label>Status</label>
                        <select
                          value={editingAgent.is_active ? 'active' : 'inactive'}
                          onChange={(e) => setEditingAgent({...editingAgent, is_active: e.target.value === 'active'})}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    )}
                    <div className="ceo-form-actions">
                      <button type="submit" className="adr-btn adr-btn--primary">
                        {editingAgent ? 'Save Changes' : 'Save Agent'}
                      </button>
                      <button
                        type="button"
                        className="adr-btn adr-btn--ghost"
                        onClick={() => {
                          setShowAddAgent(false);
                          setEditingAgent(null);
                          setNewAgent({
                            name: '',
                            email: '',
                            role: 'support_agent',
                            level: 'L1',
                            primary_department_id: '',
                            manager_id: '',
                            additional_permissions: [],
                            skills: []
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
                </div>
              )}
              <div className="ceo-data-table-wrap">
                <table className="ceo-data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => (
                      <tr key={agent.id}>
                        <td style={{ fontWeight: 600 }}>{agent.name}</td>
                        <td>{agent.email}</td>
                        <td>{agent.role}</td>
                        <td>{agent.department_name || '—'}</td>
                        <td>
                          <span className={`ceo-status-pill ${agent.is_active ? 'ceo-status-pill--ok' : 'ceo-status-pill--inactive'}`}>
                            {agent.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="adr-btn adr-btn--ghost"
                            onClick={() => handleStartEditAgent(agent)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="adr-btn adr-btn--ghost"
                            onClick={() => handleDeleteAgent(agent.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {agents.length === 0 && (
                  <div className="ceo-empty">No agents configured.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="ceo-panel">
              <div className="ceo-section-head">
                <h2>Active assignments</h2>
                <p>Latest assigned tickets (top 20 by recent activity)</p>
              </div>
              <div className="ceo-data-table-wrap">
                <table className="ceo-data-table">
                  <thead>
                    <tr>
                      <th className="ceo-sortable" onClick={() => handleAssignmentsSort('id')}>
                        ID{assignmentsSortField === 'id' ? (assignmentsSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className="ceo-sortable" onClick={() => handleAssignmentsSort('issue_title')}>
                        Issue{assignmentsSortField === 'issue_title' ? (assignmentsSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className="ceo-sortable" onClick={() => handleAssignmentsSort('assigned_to')}>
                        Agent{assignmentsSortField === 'assigned_to' ? (assignmentsSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className="ceo-sortable" onClick={() => handleAssignmentsSort('status')}>
                        Status{assignmentsSortField === 'status' ? (assignmentsSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th className="ceo-sortable" onClick={() => handleAssignmentsSort('created_at')}>
                        Created{assignmentsSortField === 'created_at' ? (assignmentsSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                      <th> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortAssignments(activeAssignmentsList(), assignmentsSortField, assignmentsSortDirection).map(
                      (ticket) => {
                        const assignedAgent = agents.find((a) => a.id === ticket.assigned_to);
                        return (
                          <tr key={ticket.id}>
                            <td>#{ticket.id}</td>
                            <td>{ticket.issue_title || (ticket.description ? `${String(ticket.description).slice(0, 50)}…` : '—')}</td>
                            <td>
                              {assignedAgent ? (
                                <div>
                                  <strong style={{ fontWeight: 600 }}>{assignedAgent.name}</strong>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{assignedAgent.email}</div>
                                </div>
                              ) : (
                                <span style={{ color: '#dc2626' }}>ID {ticket.assigned_to}</span>
                              )}
                            </td>
                            <td>
                              <span className={`adr-status-pill adr-status-pill--${ceoStatusKey(ticket)}`}>
                                {formatCeoStatusLabel(ticket)}
                              </span>
                            </td>
                            <td>{formatDate(ticket.created_at)}</td>
                            <td>
                              <button type="button" className="adr-table-view-btn" onClick={() => openCeoTicket(ticket.id)}>
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
                {activeAssignmentsList().length === 0 ? (
                  <div className="ceo-empty">No active assignments.</div>
                ) : null}
              </div>
            </div>
          )}

          {activeTab === 'trends' && (
            <div className="ceo-panel">
              <div className="ceo-section-head">
                <h2>Trends & analytics</h2>
                <p>Six-month ticket volume</p>
              </div>
              <div className="ceo-trends-grid">
                <div className="ceo-chart-box">
                  <h3 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>
                    Volume vs resolved
                  </h3>
                  <div className="ceo-chart-bars">
                    {executiveMetrics.monthlyTrends.map((month, index) => {
                      const maxTickets = Math.max(...executiveMetrics.monthlyTrends.map((m) => m.tickets), 1);
                      const minTickets = Math.min(...executiveMetrics.monthlyTrends.map((m) => m.tickets), 0);
                      const maxResolved = Math.max(...executiveMetrics.monthlyTrends.map((m) => m.resolved), 1);
                      const minResolved = Math.min(...executiveMetrics.monthlyTrends.map((m) => m.resolved), 0);
                      const ticketRange = maxTickets - minTickets;
                      const resolvedRange = maxResolved - minResolved;
                      const totalHeight =
                        ticketRange > 0
                          ? Math.max(15, 15 + ((month.tickets - minTickets) / ticketRange) * 70)
                          : 50;
                      const resolvedHeight =
                        resolvedRange > 0
                          ? Math.max(15, 15 + ((month.resolved - minResolved) / resolvedRange) * 70)
                          : 50;
                      return (
                        <div key={index} className="ceo-month-bar">
                          <div className="ceo-bar-stack">
                            <div className="ceo-bar ceo-bar--total" style={{ height: `${totalHeight}%` }} />
                            <div className="ceo-bar ceo-bar--resolved" style={{ height: `${resolvedHeight}%` }} />
                          </div>
                          <div className="ceo-bar-label">{month.month}</div>
                          <div className="ceo-bar-count">{month.tickets}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="ceo-legend">
                    <span>
                      <i style={{ background: '#6366f1' }} /> Total
                    </span>
                    <span>
                      <i style={{ background: '#10b981' }} /> Resolved
                    </span>
                  </div>
                </div>
                <div className="ceo-chart-box">
                  <h3 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 600, color: '#6b7280' }}>
                    Insights
                  </h3>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Growth</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        {executiveMetrics.monthlyTrends.length >= 2
                          ? (() => {
                              const cur = executiveMetrics.monthlyTrends[executiveMetrics.monthlyTrends.length - 1];
                              const prev = executiveMetrics.monthlyTrends[executiveMetrics.monthlyTrends.length - 2];
                              const pct =
                                prev.tickets > 0
                                  ? Math.round(((cur.tickets - prev.tickets) / prev.tickets) * 100)
                                  : 0;
                              if (pct > 0) return `Volume up ${pct}% vs prior month`;
                              if (pct < 0) return `Volume down ${Math.abs(pct)}% vs prior month`;
                              return 'Volume stable vs prior month';
                            })()
                          : 'Not enough data'}
                      </div>
                    </div>
                  </div>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Resolution time</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        Average {executiveMetrics.avgResolutionTime || '—'}h (estimated from recorded resolution times)
                      </div>
                    </div>
                  </div>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Satisfaction</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        {executiveMetrics.customerSatisfaction > 0
                          ? `${executiveMetrics.customerSatisfaction} / 5 average`
                          : 'No ratings captured'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'strategic' && (
            <div className="ceo-panel">
              <div className="ceo-section-head">
                <h2>Strategic insights</h2>
                <p>High-level summary and focus areas</p>
              </div>
              <div className="ceo-strategic-grid">
                <div className="ceo-strategic-card">
                  <h3>Highlights</h3>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Resolution rate</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>{resolutionRate}% of tickets closed</div>
                    </div>
                  </div>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Team</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        {agents.length} active agents · {getTicketsByStatus('in_progress').length} in progress
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ceo-strategic-card">
                  <h3>Recommendations</h3>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Capacity</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        Review staffing if escalations or backlog stay elevated.
                      </div>
                    </div>
                  </div>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Automation</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        Route repetitive requests through self-service and macros.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ceo-strategic-card">
                  <h3>Snapshot</h3>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Departments</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>{departments.length} tracked</div>
                    </div>
                  </div>
                  <div className="ceo-insight-row">
                    <div>
                      <strong>Open pipeline</strong>
                      <div style={{ fontSize: '0.85rem', color: '#4b5563', marginTop: 4 }}>
                        {getTicketsByStatus('new').length} new · {getTicketsByStatus('escalated').length} escalated
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'feedback' && (
            <div className="ceo-panel">
              <FeedbackInsightsPage />
            </div>
          )}

          {/* Custom Confirmation Modal */}
          {showConfirmModal && (
            <div className="ceo-modal-overlay" style={{ zIndex: 9999 }}>
              <div className="ceo-modal" style={{ maxWidth: 400, padding: 28 }}>
                <div className="ceo-modal-header">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#111827' }}>{confirmTitle}</h3>
                </div>
                <p style={{ color: '#4b5563', fontSize: '0.95rem', marginBottom: 24 }}>{confirmMessage}</p>
                <div className="ceo-form-actions" style={{ justifyContent: 'flex-end', gap: 12 }}>
                  <button type="button" className="adr-btn adr-btn--ghost" onClick={handleConfirmNo}>
                    Cancel
                  </button>
                  <button type="button" className="adr-btn adr-btn--primary" onClick={handleConfirmYes}>
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CEODashboard;
