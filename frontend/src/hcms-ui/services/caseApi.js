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

// Separate axios instance for non-v2 endpoints (e.g. /api/notifications)
const rootApi = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Shared request interceptor for auth token and tenant ID
function applyAuthInterceptor(instance) {
  instance.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('hcmsToken') || localStorage.getItem('hcmsToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const user = JSON.parse(sessionStorage.getItem('hcmsUser') || localStorage.getItem('hcmsUser') || sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
    const tenantId = user?.tenant_id || user?.tenantId || user?.organization_id;
    if (tenantId && tenantId !== 'default') {
      config.headers['X-Tenant-ID'] = tenantId;
    }
    return config;
  });
}

applyAuthInterceptor(api);
applyAuthInterceptor(rootApi);

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear auth storage and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('hcmsToken');
      localStorage.removeItem('hcmsUser');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('hcmsToken');
      sessionStorage.removeItem('hcmsUser');
      window.location.href = '/hcms/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Get dashboard metrics and recent tickets
 */
export async function getDashboardData() {
  const response = await api.get('/cases/dashboard');
  return response.data;
}

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
 * Get internal messages (visible only to HR and department heads)
 */
export async function getInternalMessages(caseId) {
  const response = await api.get(`/cases/${caseId}/internal-messages`);
  return response.data;
}

/**
 * Add an internal note to a case (visible to HR, department heads, and system admins)
 */
export async function addCaseNote(caseId, text) {
  const response = await api.post(`/cases/${caseId}/notes`, { text });
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
 * Escalate a case using the sequential L1-L5 escalation engine
 */
export async function escalateCase(caseId, escalationData = {}) {
  const response = await api.post(`/cases/${caseId}/escalate`, escalationData);
  return response.data;
}

/**
 * Request more information from the employee
 */
export async function requestInfo(caseId, message) {
  const response = await api.post(`/cases/${caseId}/request-info`, { message });
  return response.data;
}

/**
 * Get escalation history for a case
 */
export async function getEscalationHistory(caseId) {
  const response = await api.get(`/cases/${caseId}/escalation-history`);
  return response.data;
}

/**
 * Respond to an escalation consent request
 */
export async function respondToEscalationConsent(caseId, requestId, responseData) {
  const response = await api.post(`/cases/${caseId}/escalation-consent/${requestId}/respond`, responseData);
  return response.data;
}

/**
 * Acknowledge an escalation consent response (handler/HR confirms before actual escalation)
 */
export async function acknowledgeEscalationConsent(caseId, requestId) {
  const response = await api.post(`/cases/${caseId}/escalation-consent/${requestId}/acknowledge`);
  return response.data;
}

/**
 * Get pending escalation consent requests for the current employee
 */
export async function getPendingEscalationConsents() {
  const response = await api.get('/cases/escalation-consent/pending');
  return response.data;
}

/**
 * Get notifications
 */
export async function getNotifications(params = {}) {
  const response = await rootApi.get('/api/notifications', { params });
  return response.data;
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId) {
  const response = await rootApi.patch(`/api/notifications/${notificationId}/read`);
  return response.data;
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead() {
  const response = await rootApi.patch('/api/notifications/mark-all-read');
  return response.data;
}

/**
 * Backfill historical HR notifications
 */
export async function backfillHRNotifications() {
  const response = await rootApi.post('/api/notifications/backfill-hr');
  return response.data;
}

/**
 * Backfill historical Department Head / System Admin notifications
 */
export async function backfillManagerNotifications() {
  const response = await rootApi.post('/api/notifications/backfill-managers');
  return response.data;
}

/**
 * Change password
 */
export async function changePassword(passwordData) {
  const response = await api.post('/auth/change-password', passwordData);
  return response.data;
}

/**
 * Get current user profile
 */
export async function getCurrentUser() {
  const response = await api.get('/auth/me');
  return response.data;
}

/**
 * Close a ticket as employee with satisfaction check
 */
export async function closeTicketAsEmployee(caseId, satisfied, satisfactionRating) {
  const response = await api.post(`/cases/${caseId}/close`, {
    satisfied,
    satisfaction_rating: satisfactionRating
  });
  return response.data;
}

/**
 * Reopen a ticket as employee
 */
export async function reopenTicket(caseId, reason) {
  const response = await api.post(`/cases/${caseId}/reopen`, { reason });
  return response.data;
}

/**
 * Upload attachments to a case
 */
export async function uploadAttachments(caseId, files, messageId = null) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });
  if (messageId) {
    formData.append('message_id', messageId);
  }

  const response = await api.post(`/cases/${caseId}/attachments`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data;
}

/**
 * Download an attachment
 */
export async function downloadAttachment(caseId, attachmentId) {
  const response = await api.get(`/cases/${caseId}/attachments/${attachmentId}/download`, {
    responseType: 'blob'
  });
  return response;
}

/**
 * Get HR users for reassignment
 */
export async function getHRUsers() {
  const response = await api.get('/cases/users/hr');
  return response.data;
}

/**
 * Get SLA timers for a case
 */
export async function getCaseSLA(caseId) {
  const response = await api.get(`/cases/${caseId}/sla`);
  return response.data;
}

export default api;
