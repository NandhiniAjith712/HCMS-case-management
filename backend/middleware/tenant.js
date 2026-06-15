const { pool } = require('../database');
const jwt = require('jsonwebtoken');

const DEBUG = process.env.DEBUG_TENANT === '1';

/**
 * Extract tenant from request
 * Priority: subdomain > header > user's tenant
 */
const extractTenant = async (req) => {
  try {
    // Method 1: From subdomain (e.g., company1.tick-system.com)
    const host = req.get('host') || '';
    const subdomain = host.split('.')[0];
    
    if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'localhost') {
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE subdomain = ? AND status = \'active\'',
        [subdomain]
      );
      if (tenants.length > 0) {
        if (DEBUG) console.log(`✅ Tenant found via subdomain: ${subdomain}`);
        return tenants[0];
      }
    }
    
    // Method 2: From X-Tenant-ID header
    const tenantId = req.headers['x-tenant-id'];
    if (tenantId) {
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
        [tenantId]
      );
      if (tenants.length > 0) {
        if (DEBUG) console.log(`✅ Tenant found via header: ${tenantId}`);
        return tenants[0];
      }
    }
    
    // Method 3a: From authenticated user (if already set by auth middleware)
    if (req.user && req.user.tenant_id) {
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
        [req.user.tenant_id]
      );
      if (tenants.length > 0) {
        if (DEBUG) console.log(`✅ Tenant found via user: ${req.user.tenant_id}`);
        return tenants[0];
      }
    }
    
    // Method 3b: From JWT token (if user not authenticated yet)
    // This allows setTenantContext to work before authenticateToken runs
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1]; // Bearer TOKEN
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
          const tenantIdFromToken = decoded.tenant_id;
          
          if (tenantIdFromToken) {
            const [tenants] = await pool.execute(
              'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
              [tenantIdFromToken]
            );
            if (tenants.length > 0) {
              if (DEBUG) console.log(`✅ Tenant found via JWT token: ${tenantIdFromToken}`);
              return tenants[0];
            }
          }
          
          // If token has userId but no tenant_id, fetch user's tenant_id from database
          const userId = decoded.userId || decoded.id || decoded.agentId;
          if (userId) {
            // Try agents table first
            let [agents] = await pool.execute(
              'SELECT tenant_id FROM agents WHERE id = ? AND is_active = TRUE',
              [userId]
            );
            
            if (agents.length > 0 && agents[0].tenant_id) {
              const [tenants] = await pool.execute(
                'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
                [agents[0].tenant_id]
              );
              if (tenants.length > 0) {
                if (DEBUG) console.log(`✅ Tenant found via agent user_id from token: ${agents[0].tenant_id}`);
                return tenants[0];
              }
            }
            
            // Try users table
            let [users] = await pool.execute(
              'SELECT tenant_id FROM users WHERE id = ? AND is_active = TRUE',
              [userId]
            );
            
            if (users.length > 0 && users[0].tenant_id) {
              const [tenants] = await pool.execute(
                'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
                [users[0].tenant_id]
              );
              if (tenants.length > 0) {
                if (DEBUG) console.log(`✅ Tenant found via user user_id from token: ${users[0].tenant_id}`);
                return tenants[0];
              }
            }
          }
        } catch (tokenError) {
          // Token might be invalid or expired, continue to next method
          if (DEBUG) console.log('⚠️ Could not extract tenant from token:', tokenError.message);
        }
      }
    }
    
    // Method 4: Default tenant (for development/testing)
    if (process.env.NODE_ENV === 'development') {
      // Try to find default tenant by subdomain
      const [defaultTenants] = await pool.execute(
        'SELECT * FROM tenants WHERE subdomain = \'default\' AND status = \'active\' LIMIT 1'
      );
      if (defaultTenants.length > 0) {
        if (DEBUG) console.log(`⚠️ Using default tenant for development: ${defaultTenants[0].name} (ID: ${defaultTenants[0].id})`);
        return defaultTenants[0];
      }
      
      // If no default tenant, get first active tenant
      const [firstTenants] = await pool.execute(
        'SELECT * FROM tenants WHERE status = \'active\' LIMIT 1'
      );
      if (firstTenants.length > 0) {
        if (DEBUG) console.log(`⚠️ Using first active tenant for development: ${firstTenants[0].name} (ID: ${firstTenants[0].id})`);
        return firstTenants[0];
      }
      
      // If no tenants exist, create a default one
      try {
        const [createResult] = await pool.execute(
          'INSERT INTO tenants (name, subdomain, status) VALUES (?, ?, ?)',
          ['Default Tenant', 'default', 'active']
        );
        const [newTenant] = await pool.execute(
          'SELECT * FROM tenants WHERE id = ?',
          [createResult.insertId]
        );
        if (newTenant.length > 0) {
          if (DEBUG) console.log(`✅ Created and using default tenant: ${newTenant[0].name} (ID: ${newTenant[0].id})`);
          return newTenant[0];
        }
      } catch (createError) {
        console.error('Error creating default tenant:', createError);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting tenant:', error);
    return null;
  }
};

/**
 * Middleware to set tenant context
 * Should be used before authentication middleware
 */
const setTenantContext = async (req, res, next) => {
  try {
    const publicTenantSkipRoutes = [
      "/api/auth/global-login",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/staff-set-password",
      "/api/auth/customers",
      "/api/auth/verify-email",
      "/api/auth/support",
      "/health"
    ];

    if (publicTenantSkipRoutes.some(route => req.originalUrl.startsWith(route))) {
      if (DEBUG) console.log(`🔓 Skipping tenant context for public route: ${req.originalUrl}`);
      return next();
    }

    const tenant = await extractTenant(req);
    
    if (!tenant) {
      // In development, allow requests without tenant (will use default)
      if (process.env.NODE_ENV === 'development') {
        if (DEBUG) console.log('⚠️ No tenant found, continuing in development mode');
        req.tenant = null;
        req.tenantId = null;
        return next();
      }
      
      return res.status(400).json({
        success: false,
        message: 'Tenant not found or inactive. Please check your subdomain or provide X-Tenant-ID header.'
      });
    }
    
    // Set tenant in request object
    req.tenant = tenant;
    req.tenantId = tenant.id;
    
    // Also set in response locals for views
    res.locals.tenant = tenant;
    res.locals.tenantId = tenant.id;
    
    if (DEBUG) console.log(`🏢 Tenant context set: ${tenant.name} (ID: ${tenant.id})`);
    next();
  } catch (error) {
    console.error('Tenant context error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error setting tenant context'
    });
  }
};

/**
 * Middleware to verify user belongs to tenant
 * Should be used after authentication middleware
 */
const verifyTenantAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // If no tenant context was set, use user's tenant_id
    if (!req.tenantId && req.user.tenant_id) {
        if (DEBUG) console.log(`🏢 Setting tenant_id from user: ${req.user.tenant_id}`);
      req.tenantId = req.user.tenant_id;
      
      // Also fetch and set the full tenant object
      try {
        const [tenants] = await pool.execute(
          'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
          [req.user.tenant_id]
        );
        if (tenants.length > 0) {
          req.tenant = tenants[0];
          res.locals.tenant = tenants[0];
          res.locals.tenantId = req.user.tenant_id;
        }
      } catch (error) {
        console.error('Error fetching tenant:', error);
      }
    }
    
    // Trust the user's JWT/DB tenant_id as the authoritative source.
    // setTenantContext may have set a stale/fallback tenantId before authenticateToken ran.
    const userTenantId = req.user.tenant_id;
    if (userTenantId) {
      if (req.tenantId && req.tenantId !== userTenantId) {
        if (DEBUG) console.warn(`⚠️ Tenant mismatch resolved: overriding request tenant ${req.tenantId} with user's tenant ${userTenantId}`);
      }
      req.tenantId = userTenantId;

      // Ensure full tenant object is available
      if (!req.tenant || req.tenant.id !== userTenantId) {
        try {
          const [tenants] = await pool.execute(
            'SELECT * FROM tenants WHERE id = ? AND status = \'active\'',
            [userTenantId]
          );
          if (tenants.length > 0) {
            req.tenant = tenants[0];
            res.locals.tenant = tenants[0];
            res.locals.tenantId = userTenantId;
          }
        } catch (error) {
          console.error('Error fetching tenant:', error);
        }
      }
    } else if (!req.tenantId) {
      // In development, allow if no tenant context
      if (process.env.NODE_ENV === 'development') {
        if (DEBUG) console.log('⚠️ No tenant context found, continuing in development mode');
        return next();
      }
      return res.status(400).json({
        success: false,
        message: 'Tenant context required'
      });
    }

    next();
  } catch (error) {
    console.error('Tenant access verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying tenant access'
    });
  }
};

/**
 * Optional tenant context (for routes that work with or without tenant)
 */
const optionalTenantContext = async (req, res, next) => {
  try {
    const tenant = await extractTenant(req);
    if (tenant) {
      req.tenant = tenant;
      req.tenantId = tenant.id;
      res.locals.tenant = tenant;
      res.locals.tenantId = tenant.id;
    }
    next();
  } catch (error) {
    // Continue even if tenant extraction fails
    next();
  }
};

module.exports = {
  extractTenant,
  setTenantContext,
  verifyTenantAccess,
  optionalTenantContext
};

