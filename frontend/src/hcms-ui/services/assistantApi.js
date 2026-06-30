/**
 * HCMS AI Assistant API service.
 * Communicates with the backend HCMS assistant endpoint at /api/v2/ai.
 */

const API_BASE = '/api/v2/ai';

function getToken() {
  return (
    sessionStorage.getItem('hcmsToken') ||
    localStorage.getItem('hcmsToken') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('token') ||
    ''
  );
}

function getUser() {
  const raw =
    sessionStorage.getItem('hcmsUser') ||
    localStorage.getItem('hcmsUser') ||
    sessionStorage.getItem('user') ||
    localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getTenantId() {
  const user = getUser();
  return user?.tenant_id || user?.tenantId || user?.organization_id || null;
}

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const tenantId = getTenantId();
  if (tenantId && tenantId !== 'default') {
    headers['X-Tenant-ID'] = tenantId;
  }
  return headers;
}

const FETCH_TIMEOUT_MS = 35000;

function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

/**
 * Send a conversation to the HCMS assistant.
 * @param {{ role: string, content: string }[]} messages
 * @param {object} context
 * @returns {Promise<{ reply: string }>}
 */
export async function sendAssistantMessage(messages, context = {}) {
  const res = await fetchWithTimeout(`${API_BASE}/assistant`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ messages, context })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    if (res.status === 404) {
      throw new Error('Assistant service is unavailable. Please make sure the backend is running.');
    }
    if (res.status === 403) {
      throw new Error('The assistant is only available for employees.');
    }
    if (res.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    throw new Error(data.message || `Request failed (${res.status})`);
  }

  return data.data || {};
}

/**
 * Check the assistant health endpoint.
 * @returns {Promise<object>}
 */
export async function checkAssistantHealth() {
  const res = await fetch(`${API_BASE}/health`, {
    method: 'GET',
    headers: getHeaders()
  });
  return res.json().catch(() => ({ success: false }));
}
