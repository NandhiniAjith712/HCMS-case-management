const { pool } = require('../database');

/**
 * Service to handle tenant-level SPOC logic
 * Replaces organization-based logic with tenant-based approach
 */
class TenantSPOCService {
  /**
   * Gets all products for a tenant (replaces organization-based product access)
   * 
   * @param {number} tenantId - The tenant ID
   * @returns {Promise<Array>} - List of products
   */
  async getProductsForTenant(tenantId = 1) {
    try {
      const [products] = await pool.execute(
        `SELECT p.* FROM products p
         WHERE p.tenant_id = ? AND p.status = 'active'
         ORDER BY p.name ASC`,
        [tenantId]
      );
      return products;
    } catch (error) {
      console.error('Error fetching products for tenant:', error);
      throw error;
    }
  }

  /**
   * Gets tenant-level analytics for SPOC dashboard
   * 
   * @param {number} tenantId - The tenant ID
   * @returns {Promise<Object>} - Analytics data
   */
  async getTenantAnalytics(tenantId = 1) {
    try {
      // Get ticket counts by status
      const [statusCounts] = await pool.execute(
        `SELECT status, COUNT(*) as count FROM tickets 
         WHERE tenant_id = ? 
         GROUP BY status`,
        [tenantId]
      );

      // Get product SPOC count
      const [productSpocCount] = await pool.execute(
        `SELECT COUNT(*) as count FROM users 
         WHERE tenant_id = ? AND role = 'product_spoc' AND is_active = TRUE`,
        [tenantId]
      );

      // Get active users count
      const [activeUsersCount] = await pool.execute(
        `SELECT COUNT(*) as count FROM users 
         WHERE tenant_id = ? AND is_active = TRUE`,
        [tenantId]
      );

      return {
        statusCounts: statusCounts.reduce((acc, row) => {
          acc[row.status] = row.count;
          return acc;
        }, {}),
        productSpocCount: productSpocCount[0]?.count || 0,
        activeUsersCount: activeUsersCount[0]?.count || 0
      };
    } catch (error) {
      console.error('Error fetching tenant analytics:', error);
      throw error;
    }
  }

  /**
   * Gets product SPOCs for a tenant
   * 
   * @param {number} tenantId - The tenant ID
   * @returns {Promise<Array>} - List of product SPOCs
   */
  async getProductSPOCs(tenantId = 1) {
    try {
      const [spocs] = await pool.execute(
        `SELECT u.id, u.name, u.email, u.phone, u.product_scope_id, p.name as product_name
         FROM users u
         LEFT JOIN products p ON u.product_scope_id = p.id
         WHERE u.tenant_id = ? AND u.role = 'product_spoc' AND u.is_active = TRUE
         ORDER BY u.name ASC`,
        [tenantId]
      );
      return spocs;
    } catch (error) {
      console.error('Error fetching product SPOCs:', error);
      throw error;
    }
  }

  /**
   * Gets users for a tenant (for SPOC dashboard)
   * 
   * @param {number} tenantId - The tenant ID
   * @returns {Promise<Array>} - List of users
   */
  async getTenantUsers(tenantId = 1) {
    try {
      const [users] = await pool.execute(
        `SELECT id, name, email, role, is_active, created_at 
         FROM users 
         WHERE tenant_id = ? 
         ORDER BY created_at DESC`,
        [tenantId]
      );
      return users;
    } catch (error) {
      console.error('Error fetching tenant users:', error);
      throw error;
    }
  }
}

module.exports = new TenantSPOCService();
