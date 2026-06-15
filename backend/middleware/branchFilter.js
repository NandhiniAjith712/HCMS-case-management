const { pool } = require('../database');

/**
 * Branch/Entity Filtering Middleware
 * 
 * This middleware adds branch/entity filtering support to queries.
 * Branches are represented by the departments table within a tenant.
 * 
 * Usage:
 * - Add X-Branch-ID header to filter by specific branch/department
 * - Middleware sets req.branchId for downstream use
 * - Queries can optionally filter by branch_id/department_id
 */

/**
 * Extract branch context from request
 * Priority: X-Branch-ID header → user's primary_department_id → none
 */
const setBranchContext = async (req, res, next) => {
  try {
    // Try header first
    let branchId = req.headers['x-branch-id'] || req.headers['x-department-id'];
    
    // If no header, try user's primary department
    if (!branchId && req.user && req.user.primary_department_id) {
      branchId = req.user.primary_department_id;
    }
    
    if (branchId) {
      branchId = parseInt(branchId);
      if (isNaN(branchId)) {
        branchId = null;
      }
    }
    
    req.branchId = branchId;
    req.branchContext = branchId ? { id: branchId } : null;
    
    next();
  } catch (error) {
    console.error('Error setting branch context:', error);
    // Don't block request if branch context fails
    req.branchId = null;
    req.branchContext = null;
    next();
  }
};

/**
 * Verify that a branch belongs to the current tenant
 */
const verifyBranchAccess = async (req, res, next) => {
  try {
    const { branchId, tenantId } = req;
    
    if (!branchId) {
      return next(); // No branch filter, skip verification
    }
    
    // Verify branch belongs to tenant
    const [departments] = await pool.execute(
      'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
      [branchId, tenantId]
    );
    
    if (departments.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Branch/department not found or access denied'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error verifying branch access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify branch access'
    });
  }
};

/**
 * Add branch filter to query builder
 * This is a helper function to be used in route handlers
 * 
 * @param {string} query - Base SQL query
 * @param {Array} params - Query parameters array
 * @param {number|null} branchId - Branch ID to filter by
 * @param {string} columnName - Column name for branch filter (default: 'department_id')
 * @returns {object} { query, params }
 */
const addBranchFilter = (query, params, branchId, columnName = 'department_id') => {
  if (branchId) {
    // Check if query already has WHERE clause
    if (query.toLowerCase().includes(' where ')) {
      query += ` AND ${columnName} = ?`;
    } else {
      query += ` WHERE ${columnName} = ?`;
    }
    params.push(branchId);
  }
  return { query, params };
};

/**
 * Add multi-layer filtering (tenant + role + branch) to query
 * This is a comprehensive helper for complex queries
 * 
 * @param {object} req - Express request object
 * @param {string} query - Base SQL query
 * @param {Array} params - Query parameters array
 * @param {object} options - Filtering options
 * @returns {object} { query, params }
 */
const addMultiLayerFilters = (req, query, params, options = {}) => {
  const { tenantId, branchId, user } = req;
  const { 
    tenantColumn = 'tenant_id', 
    branchColumn = 'department_id',
    roleColumn = 'role'
  } = options;
  
  // Always add tenant filter (primary isolation)
  if (tenantId && query.toLowerCase().includes(' where ')) {
    query += ` AND ${tenantColumn} = ?`;
    params.push(tenantId);
  } else if (tenantId) {
    query += ` WHERE ${tenantColumn} = ?`;
    params.push(tenantId);
  }
  
  // Add branch filter if specified
  if (branchId) {
    query += ` AND ${branchColumn} = ?`;
    params.push(branchId);
  }
  
  // Add role-based filtering if needed (optional)
  // This can be customized based on specific route requirements
  
  return { query, params };
};

module.exports = {
  setBranchContext,
  verifyBranchAccess,
  addBranchFilter,
  addMultiLayerFilters
};
