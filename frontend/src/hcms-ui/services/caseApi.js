import axios from 'axios';

/**
 * HCMS Case Management API Service
 * Points to backend /api/v2 endpoints
 */

const api = axios.create({
  baseURL: '/api/v2',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token and tenant ID to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hcmsToken') || sessionStorage.getItem('hcmsToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Add tenant ID from user storage or default
  const user = JSON.parse(localStorage.getItem('hcmsUser') || sessionStorage.getItem('hcmsUser') || '{}');
  if (user?.tenant_id) {
    config.headers['X-Tenant-ID'] = user.tenant_id;
  } else if (user?.organization_id) {
    config.headers['X-Tenant-ID'] = user.organization_id;
  } else {
    config.headers['X-Tenant-ID'] = 'default';
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth storage and redirect to login
      localStorage.removeItem('hcmsToken');
      localStorage.removeItem('hcmsUser');
      sessionStorage.removeItem('hcmsToken');
      sessionStorage.removeItem('hcmsUser');
      window.location.href = '/hcms/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Get all cases for the current user
 * @param {Object} params - Query parameters
 * @param {string} params.status - Filter by status
 * @param {string} params.priority - Filter by priority
 * @param {string} params.category - Filter by category
 * @param {boolean} params.ownOnly - Only return user's own cases
 * @param {boolean} params.escalatedOnly - Only return escalated cases
 */
export async function getCases(params = {}) {
  const response = await api.get('/cases', { params });
  return response.data;
}

/**
 * Get a single case by ID
 */
export async function getCaseById(caseId) {
  const response = await api.get(`/cases/${caseId}`);
  return response.data;
}

/**
 * Create a new case
 */
export async function createCase(caseData) {
  const response = await api.post('/cases', caseData);
  return response.data;
}

/**
 * Update an existing case
 */
export async function updateCase(caseId, caseData) {
  const response = await api.put(`/cases/${caseId}`, caseData);
  return response.data;
}

/**
 * Delete a case
 */
export async function deleteCase(caseId) {
  const response = await api.delete(`/cases/${caseId}`);
  return response.data;
}

/**
 * Get case history/audit log
 */
export async function getCaseHistory(caseId) {
  const response = await api.get(`/cases/${caseId}/history`);
  return response.data;
}

/**
 * Add a comment to a case
 */
export async function addCaseComment(caseId, commentData) {
  const response = await api.post(`/cases/${caseId}/comments`, commentData);
  return response.data;
}

/**
 * Get case comments
 */
export async function getCaseComments(caseId) {
  const response = await api.get(`/cases/${caseId}/comments`);
  return response.data;
}

/**
 * Update case status
 */
export async function updateCaseStatus(caseId, status, reason = '') {
  const response = await api.patch(`/cases/${caseId}/status`, { status, reason });
  return response.data;
}

/**
 * Escalate a case
 */
export async function escalateCase(caseId, escalationData) {
  const response = await api.post(`/cases/${caseId}/escalate`, escalationData);
  return response.data;
}

export default api;
