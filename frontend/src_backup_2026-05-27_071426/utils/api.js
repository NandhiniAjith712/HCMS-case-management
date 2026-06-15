/**
 * Centralized API utility functions for authentication headers
 * This ensures all API requests include proper authentication for multi-tenancy
 */

// Staff routes use staffData/staffToken; customer routes use customerData/customerToken
// Prevents tab confusion when agent + customer both logged in (different tabs)
/** True when URL path should use staff token + staffData (vs customer session). */
export const isStaffRoute = () => {
  const p = (typeof window !== 'undefined' && window.location?.pathname) || '';
  if (/^\/(customer\/ticket\/|user\/ticket\/|customerdashboard|userdashboard|customer-chat|user-chat)/.test(p)) {
    return false;
  }
  return /^\/(agentdashboard|agent-dashboard|agent\/|manager|manager-dashboard|ceo|tickets|ticket\/|products|faq-admin|businessdashboard|business-products|business-tickets)/.test(p) || p === '/tickets-table';
};

const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const STAFF_ROLES = ['support_agent', 'agent', 'support_manager', 'manager', 'ceo', 'admin'];

export const clearAllAuthStorage = () => {
  // Clear all user data (staff + customer + legacy) in one place.
  [
    'staffData', 'staffToken', 'userData', 'userToken', 'tickUser', 'token', 'autoLoginContext',
    'agentData', 'agentToken', 'customerData', 'customerToken', 'customer_id', 'customer_name',
    'customer_email', 'customer_role', 'access_token', 'user_id', 'user_name', 'user_email',
    'user_role', 'is_logged_in', 'session_expires', 'login_timestamp'
  ].forEach((k) => {
    try { localStorage.removeItem(k); } catch (_) {}
    try { sessionStorage.removeItem(k); } catch (_) {}
  });
  try { localStorage.removeItem('remembered_login_id'); } catch (_) {}
  try { localStorage.removeItem('remembered_password'); } catch (_) {}
};

export const isStaffSessionValid = () => {
  const token =
    sessionStorage.getItem('staffToken') ||
    localStorage.getItem('staffToken') ||
    sessionStorage.getItem('userToken') ||
    localStorage.getItem('userToken') ||
    localStorage.getItem('agentToken');
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = payload.exp;
  if (!exp || Date.now() >= Number(exp) * 1000) return false;
  const role = String(payload.role || payload.userRole || '').toLowerCase();
  if (!role || !STAFF_ROLES.includes(role)) return false;
  return true;
};

export const installGlobal401Handler = () => {
  // One-time global fetch wrapper so *all* API calls (even raw fetch) enforce logout-on-401.
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return () => {};
  if (window.__itsmFetch401Installed) return () => {};
  window.__itsmFetch401Installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const resp = await originalFetch(...args);
    if (resp && resp.status === 401) {
      try { clearAllAuthStorage(); } catch (_) {}
      try {
        const p = window.location?.pathname || '';
        const isCustomerRoute = p.startsWith('/customer') || 
                               p.startsWith('/userdashboard') || 
                               p.startsWith('/chat/') || 
                               p.startsWith('/feedback/') ||
                               p.startsWith('/user/ticket');
        const redirectPath = isCustomerRoute ? '/customer-access' : '/login';
        if (p !== redirectPath) window.location.replace(redirectPath);
      } catch (_) {}
    }
    return resp;
  };

  return () => {
    try { window.fetch = originalFetch; } catch (_) {}
    try { delete window.__itsmFetch401Installed; } catch (_) {}
  };
};

const canonicalizeEmail = (email) => {
  const raw = String(email || '').trim().toLowerCase();
  if (!raw || !raw.includes('@')) return raw;
  const [local, domain] = raw.split('@');
  if (!local || !domain) return raw;
  // Keep frontend comparison aligned with backend normalizeEmail behavior for Gmail-style aliases.
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const plusIndex = local.indexOf('+');
    const noPlus = plusIndex >= 0 ? local.slice(0, plusIndex) : local;
    const noDots = noPlus.replace(/\./g, '');
    return `${noDots}@gmail.com`;
  }
  return `${local}@${domain}`;
};

export const getAuthHeaders = () => {
  const useStaff = isStaffRoute();
  const p = (typeof window !== 'undefined' && window.location?.pathname) || '';
  const isBusinessRoute = /^\/(businessdashboard|business-products|business-tickets)/.test(p);
  const staffToken = sessionStorage.getItem('staffToken') || localStorage.getItem('staffToken') ||
    sessionStorage.getItem('userToken') || localStorage.getItem('userToken') || localStorage.getItem('agentToken');
  const businessToken = localStorage.getItem('businessDashboardToken');
  // Customer sessions must not fall back to generic `userToken`/`token` because staff logins can overwrite them.
  // Prefer explicit customer tokens and only fall back to legacy keys when they decode to a non-staff role.
  const customerToken =
    sessionStorage.getItem('customerToken') ||
    localStorage.getItem('customerToken') ||
    localStorage.getItem('access_token');
  const legacyMaybeMixed =
    localStorage.getItem('userToken') ||
    localStorage.getItem('token');
  const legacyPayload = legacyMaybeMixed ? decodeJwtPayload(legacyMaybeMixed) : null;
  const legacyRole = String(legacyPayload?.role || legacyPayload?.userRole || '').toLowerCase();
  const safeLegacyCustomerToken =
    legacyMaybeMixed && legacyRole && !['support_agent', 'agent', 'support_manager', 'manager', 'ceo', 'admin'].includes(legacyRole)
      ? legacyMaybeMixed
      : null;
  const token = useStaff
    ? (isBusinessRoute ? (businessToken || staffToken) : staffToken)
    : (customerToken || safeLegacyCustomerToken);
  
  const userData = useStaff
    ? (sessionStorage.getItem('staffData') || localStorage.getItem('staffData') ||
       sessionStorage.getItem('userData') || localStorage.getItem('agentData'))
    : (sessionStorage.getItem('customerData') || localStorage.getItem('customerData') ||
       localStorage.getItem('userData') || localStorage.getItem('tickUser'));
  
  let tenantId = null;
  
  // Extract tenant_id from user data
  if (userData) {
    try {
      const user = JSON.parse(userData);
      tenantId = user?.tenant_id;
    } catch (e) {
      console.error('Error parsing user data:', e);
    }
  }
  
  // If tenant_id is not in user data, try to extract from JWT token
  if (!tenantId && token) {
    try {
      const payload = decodeJwtPayload(token);
      tenantId = payload.tenant_id;
    } catch (e) {
      console.warn('Could not extract tenant_id from token:', e);
    }
  }
  
  // Fallback to tenant 1 for single-tenant setups (e.g. IMAP-created tickets use tenant_id=1)
  if (!tenantId) {
    tenantId = 1;
  }

  let organizationId = null;
  if (userData) {
    try {
      const user = JSON.parse(userData);
      organizationId = user?.organization_id;
    } catch (e) {}
  }
  if (!organizationId && token) {
    try {
      const payload = decodeJwtPayload(token);
      organizationId = payload.organization_id;
    } catch (e) {}
  }
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId.toString();
  }

  if (organizationId) {
    headers['X-Organization-ID'] = organizationId.toString();
  }
  
  return headers;
};

/** Raw JWT for WebSocket auth (no `Bearer ` prefix). */
export const getBearerToken = () => {
  const h = getAuthHeaders();
  const auth = h.Authorization || '';
  const m = /^Bearer\s+(.+)/i.exec(auth);
  return m ? m[1].trim() : null;
};

/**
 * Get the current tenant ID for the logged-in user
 * Used by WebSocket and other non-HTTP contexts that need tenant context
 *
 * @returns {number} Tenant ID (defaults to 1)
 */
export const getTenantId = () => {
  const useStaff = isStaffRoute();
  const userData = useStaff
    ? (sessionStorage.getItem('staffData') || localStorage.getItem('staffData') ||
       sessionStorage.getItem('userData') || localStorage.getItem('agentData'))
    : (sessionStorage.getItem('customerData') || localStorage.getItem('customerData') ||
       localStorage.getItem('userData') || localStorage.getItem('tickUser'));

  if (userData) {
    try {
      const user = JSON.parse(userData);
      if (user?.tenant_id != null) return Number(user.tenant_id);
    } catch (e) {
      console.error('Error parsing user data:', e);
    }
  }

  const token = useStaff
    ? (sessionStorage.getItem('staffToken') || localStorage.getItem('staffToken') ||
       sessionStorage.getItem('userToken') || localStorage.getItem('userToken') || localStorage.getItem('agentToken'))
    : (sessionStorage.getItem('customerToken') || localStorage.getItem('customerToken') ||
       localStorage.getItem('access_token') || localStorage.getItem('userToken'));
  if (token) {
    try {
      const payload = decodeJwtPayload(token);
      if (payload.tenant_id != null) return Number(payload.tenant_id);
    } catch (e) {
      console.warn('Could not extract tenant_id from token:', e);
    }
  }

  return 1;
};

/**
 * Get authentication headers for FormData requests
 * Does not set Content-Type (browser will set it with boundary)
 * 
 * @returns {Object} Headers object with Authorization and X-Tenant-ID (no Content-Type)
 */
export const getAuthHeadersFormData = () => {
  const useStaff = isStaffRoute();
  const p = (typeof window !== 'undefined' && window.location?.pathname) || '';
  const isBusinessRoute = /^\/(businessdashboard|business-products|business-tickets)/.test(p);
  const staffToken = sessionStorage.getItem('staffToken') || localStorage.getItem('staffToken') ||
    sessionStorage.getItem('userToken') || localStorage.getItem('userToken') || localStorage.getItem('agentToken');
  const businessToken = localStorage.getItem('businessDashboardToken');
  const token = useStaff
    ? (isBusinessRoute ? (businessToken || staffToken) : staffToken)
    : (sessionStorage.getItem('customerToken') || localStorage.getItem('customerToken') ||
       localStorage.getItem('access_token') || localStorage.getItem('userToken'));
  
  const userData = useStaff
    ? (sessionStorage.getItem('staffData') || localStorage.getItem('staffData') ||
       sessionStorage.getItem('userData') || localStorage.getItem('agentData'))
    : (sessionStorage.getItem('customerData') || localStorage.getItem('customerData') ||
       localStorage.getItem('userData') || localStorage.getItem('tickUser'));
  
  let tenantId = null;
  
  if (userData) {
    try {
      const user = JSON.parse(userData);
      tenantId = user?.tenant_id;
    } catch (e) {
      console.error('Error parsing user data:', e);
    }
  }
  
  if (!tenantId && token) {
    try {
      const payload = decodeJwtPayload(token);
      tenantId = payload.tenant_id;
    } catch (e) {
      console.warn('Could not extract tenant_id from token:', e);
    }
  }
  
  // Fallback to tenant 1 for single-tenant setups
  if (!tenantId) {
    tenantId = 1;
  }

  let organizationId = null;
  if (userData) {
    try {
      const user = JSON.parse(userData);
      organizationId = user?.organization_id;
    } catch (e) {}
  }
  if (!organizationId && token) {
    try {
      const payload = decodeJwtPayload(token);
      organizationId = payload.organization_id;
    } catch (e) {}
  }
  
  const headers = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId.toString();
  }

  if (organizationId) {
    headers['X-Organization-ID'] = organizationId.toString();
  }
  
  return headers;
};

/**
 * Make authenticated API request
 * Wrapper function for fetch with automatic auth headers
 * 
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options (method, body, etc.)
 * @param {boolean} isFormData - Whether the request uses FormData
 * @returns {Promise<Response>} Fetch response
 */
export const authenticatedFetch = async (url, options = {}, isFormData = false) => {
  const perfEnabled = String(process.env.REACT_APP_PERF_LOG || '') === '1';
  const perfSlowMs = Number(process.env.REACT_APP_PERF_SLOW_MS || 800);
  const perfLogAll = String(process.env.REACT_APP_PERF_LOG_ALL || '') === '1';
  const start = perfEnabled ? performance.now() : 0;

  const headers = isFormData ? getAuthHeadersFormData() : getAuthHeaders();
  
  // Merge with existing headers
  const mergedHeaders = {
    ...headers,
    ...(options.headers || {})
  };
  
  // Remove Content-Type for FormData (browser sets it automatically)
  if (isFormData && mergedHeaders['Content-Type']) {
    delete mergedHeaders['Content-Type'];
  }
  
  try {
    const resp = await fetch(url, {
      ...options,
      headers: mergedHeaders
    });
    // Central check (still useful for non-window environments/tests).
    if (resp && resp.status === 401) {
      try { clearAllAuthStorage(); } catch (_) {}
      try {
        const p = window.location?.pathname || '';
        const isCustomerRoute = p.startsWith('/customer') || 
                               p.startsWith('/userdashboard') || 
                               p.startsWith('/chat/') || 
                               p.startsWith('/feedback/') ||
                               p.startsWith('/user/ticket');
        const redirectPath = isCustomerRoute ? '/customer-access' : '/login';
        if (p !== redirectPath) window.location.replace(redirectPath);
      } catch (_) {}
    }
    return resp;
  } finally {
    if (perfEnabled) {
      const ms = performance.now() - start;
      if (perfLogAll || ms >= perfSlowMs) {
        const method = (options?.method || 'GET').toUpperCase();
        // Keep it short; endpoint + duration is enough to spot the 10–15s call.
        // eslint-disable-next-line no-console
        console.log(`[perf][fe] ${method} ${ms.toFixed(1)}ms ${url}`);
      }
    }
  }
};

/**
 * Get base API URL
 * Can be configured via environment variable
 * 
 * @returns {string} Base API URL
 */
export const getApiBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_URL;
  if (envUrl != null && String(envUrl).trim() !== '') {
    const stripped = String(envUrl).trim().replace(/\/api\/?$/, '');
    return stripped || String(envUrl).trim();
  }
  // Dev: same-origin paths use Create React App proxy (package.json → backend)
  if (process.env.NODE_ENV === 'development') {
    return '';
  }
  return 'http://localhost:5000';
};

/**
 * Build full API URL
 *
 * @param {string} endpoint - API endpoint path (e.g., '/api/tickets')
 * @returns {string} Full API URL
 */
export const buildApiUrl = (endpoint) => {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (baseUrl === '') {
    return cleanEndpoint;
  }
  return `${baseUrl}${cleanEndpoint}`;
};

export const fetchTicketReplySuggestions = async (ticketId, draftMessage = '') => {
  const response = await authenticatedFetch(buildApiUrl('/api/ai/ticket-reply-suggestions'), {
    method: 'POST',
    body: JSON.stringify({ ticketId, draftMessage })
  });
  const data = await response.json();
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Failed to get reply suggestions');
  }
  return Array.isArray(data?.data?.suggestions) ? data.data.suggestions : [];
};

export const fetchPublicFeedbackForm = async (ticketId, token) => {
  const response = await fetch(buildApiUrl(`/api/feedback/public/${ticketId}?token=${encodeURIComponent(token || '')}`));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Failed to load feedback form');
  }
  return data.data;
};

export const submitPublicFeedback = async ({ ticketId, token, rating, feedbackText }) => {
  const response = await fetch(buildApiUrl(`/api/feedback/public/${ticketId}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, rating, feedbackText })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Failed to submit feedback');
  }
  return data;
};

export const fetchFeedbackInsights = async () => {
  const response = await authenticatedFetch(buildApiUrl('/api/feedback/insights'), { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || 'Failed to load feedback insights');
  }
  return data.data;
};

/**
 * Check if customer session (customerToken + customerData) is valid and not expired
 * @param {string} [expectedEmail] - If provided, also verify customer email matches
 * @returns {boolean}
 */
export const isCustomerSessionValid = (expectedEmail) => {
  const token =
    sessionStorage.getItem('customerToken') ||
    localStorage.getItem('customerToken');
  const customerData =
    sessionStorage.getItem('customerData') ||
    localStorage.getItem('customerData');
  if (!token || !customerData) return false;
  try {
    const payload = decodeJwtPayload(token);
    if (!payload) return false;
    const exp = payload.exp;
    if (!exp || Date.now() >= exp * 1000) return false;
    if (expectedEmail) {
      const user = JSON.parse(customerData);
      const got = canonicalizeEmail(user?.email || '');
      const want = canonicalizeEmail(expectedEmail || '');
      if (!got || got !== want) return false;
    }
    return true;
  } catch {
    return false;
  }
};

