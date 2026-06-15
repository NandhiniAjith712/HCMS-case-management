const { pool } = require('../database');

/**
 * Helper to add tenant_id to WHERE clause
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters array
 * @param {number} tenantId - Tenant ID to filter by
 * @returns {Object} - Updated query and params
 */
const addTenantFilter = (query, params, tenantId) => {
  if (!tenantId) {
    throw new Error('tenant_id is required for tenant filtering');
  }
  
  // Check if WHERE clause already exists
  const hasWhere = query.toLowerCase().includes('where');
  
  if (hasWhere) {
    query += ` AND tenant_id = ?`;
  } else {
    query += ` WHERE tenant_id = ?`;
  }
  
  params.push(tenantId);
  return { query, params };
};

/**
 * Execute query with automatic tenant filtering
 * @param {string} query - SQL query string
 * @param {Array} params - Query parameters
 * @param {number} tenantId - Tenant ID
 * @returns {Promise} - Query result
 */
const executeWithTenant = async (query, params = [], tenantId) => {
  if (!tenantId) {
    throw new Error('tenant_id is required');
  }
  
  const { query: filteredQuery, params: filteredParams } = addTenantFilter(query, params, tenantId);
  return await pool.execute(filteredQuery, filteredParams);
};

/**
 * Get tickets for tenant with optional filters
 */
const getTicketsForTenant = async (tenantId, filters = {}) => {
  let query = `
    SELECT 
      t.id, t.name, t.email, t.mobile, t.product, t.product_id,
      t.module, t.module_id, t.description, t.issue_type,
      t.issue_type_other, t.issue_title, t.attachment_name,
      t.attachment_type, t.status, t.user_id, t.assigned_to,
      t.assigned_by, t.created_at, t.updated_at, t.resolution_time,
      u.name as assigned_to_name,
      u.email as assigned_to_email,
      ta.agent_id as allocation_agent_id
    FROM tickets t
    LEFT JOIN agents u ON t.assigned_to = u.id AND u.tenant_id = ?
    LEFT JOIN ticket_allocations ta ON ta.ticket_id = t.id AND ta.tenant_id = ?
    WHERE t.tenant_id = ?
  `;
  
  const params = [tenantId, tenantId, tenantId];
  
  if (filters.status) {
    query += ' AND t.status = ?';
    params.push(filters.status);
  }
  
  if (filters.assigned_to) {
    query += ' AND t.assigned_to = ?';
    params.push(filters.assigned_to);
  }
  
  if (filters.user_id) {
    query += ' AND t.user_id = ?';
    params.push(filters.user_id);
  }
  
  if (filters.priority) {
    query += ' AND t.priority = ?';
    params.push(filters.priority);
  }
  
  query += ' ORDER BY t.created_at DESC';
  
  return await pool.execute(query, params);
};

/**
 * Get single ticket for tenant
 */
const getTicketForTenant = async (ticketId, tenantId) => {
  const [tickets] = await pool.execute(
    `SELECT 
      t.*,
      u.name as assigned_to_name,
      u.email as assigned_to_email,
      ta.agent_id as allocation_agent_id
    FROM tickets t
    LEFT JOIN agents u ON t.assigned_to = u.id AND u.tenant_id = ?
    LEFT JOIN ticket_allocations ta ON ta.ticket_id = t.id AND ta.tenant_id = ?
    WHERE t.id = ? AND t.tenant_id = ?`,
    [tenantId, tenantId, ticketId, tenantId]
  );
  
  return tickets.length > 0 ? tickets[0] : null;
};

/**
 * Create ticket with tenant context
 */
const createTicketForTenant = async (tenantId, ticketData) => {
  const {
    user_id, name, email, mobile, product, product_id, module, module_id,
    description, issue_type, issue_type_other, issue_title,
    attachment_name, attachment_type, attachment, priority = 'medium'
  } = ticketData;
  
  const [result] = await pool.execute(
    `INSERT INTO tickets (
      tenant_id, user_id, name, email, mobile, product, product_id,
      module, module_id, description, issue_type, issue_type_other,
      issue_title, attachment_name, attachment_type, attachment, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    [
      tenantId, user_id, name, email, mobile, product, product_id,
      module, module_id, description, issue_type, issue_type_other,
      issue_title, attachment_name, attachment_type, attachment, priority
    ]
  );
  
  return result.insertId;
};

/**
 * Get products for tenant
 */
const getProductsForTenant = async (tenantId, status = 'active') => {
  if (status) {
    return await pool.execute(
      'SELECT * FROM products WHERE tenant_id = ? AND status = ? ORDER BY name ASC',
      [tenantId, status]
    );
  }
  return await pool.execute(
    'SELECT * FROM products WHERE tenant_id = ? ORDER BY name ASC',
    [tenantId]
  );
};

/**
 * Get modules for tenant and product
 */
const getModulesForTenant = async (tenantId, productId, status = 'active') => {
  if (status) {
    return await pool.execute(
      'SELECT * FROM modules WHERE tenant_id = ? AND product_id = ? AND status = ? ORDER BY name ASC',
      [tenantId, productId, status]
    );
  }
  return await pool.execute(
    'SELECT * FROM modules WHERE tenant_id = ? AND product_id = ? ORDER BY name ASC',
    [tenantId, productId]
  );
};

/**
 * Get SLA configurations for tenant
 */
const getSLAConfigurationsForTenant = async (tenantId, filters = {}) => {
  let query = 'SELECT * FROM sla_configurations WHERE tenant_id = ?';
  const params = [tenantId];
  
  if (filters.module_id) {
    query += ' AND module_id = ?';
    params.push(filters.module_id);
  }
  
  if (filters.is_active !== undefined) {
    query += ' AND is_active = ?';
    params.push(filters.is_active);
  }
  
  query += ' ORDER BY priority_level ASC';
  
  return await pool.execute(query, params);
};

/**
 * Get users for tenant
 */
const getUsersForTenant = async (tenantId, filters = {}) => {
  let query = 'SELECT * FROM users WHERE tenant_id = ?';
  const params = [tenantId];
  
  if (filters.role) {
    query += ' AND role = ?';
    params.push(filters.role);
  }
  
  if (filters.is_active !== undefined) {
    query += ' AND is_active = ?';
    params.push(filters.is_active);
  }
  
  query += ' ORDER BY created_at DESC';
  
  return await pool.execute(query, params);
};

/**
 * Get agents for tenant
 */
const getAgentsForTenant = async (tenantId, filters = {}) => {
  let query = 'SELECT * FROM agents WHERE tenant_id = ?';
  const params = [tenantId];
  
  if (filters.role) {
    query += ' AND role = ?';
    params.push(filters.role);
  }
  
  if (filters.is_active !== undefined) {
    query += ' AND is_active = ?';
    params.push(filters.is_active);
  }
  
  query += ' ORDER BY created_at DESC';
  
  return await pool.execute(query, params);
};

/**
 * Verify resource belongs to tenant
 */
const verifyResourceTenant = async (table, resourceId, tenantId) => {
  const [results] = await pool.execute(
    `SELECT id FROM ${table} WHERE id = ? AND tenant_id = ?`,
    [resourceId, tenantId]
  );
  return results.length > 0;
};

module.exports = {
  addTenantFilter,
  executeWithTenant,
  getTicketsForTenant,
  getTicketForTenant,
  createTicketForTenant,
  getProductsForTenant,
  getModulesForTenant,
  getSLAConfigurationsForTenant,
  getUsersForTenant,
  getAgentsForTenant,
  verifyResourceTenant
};

