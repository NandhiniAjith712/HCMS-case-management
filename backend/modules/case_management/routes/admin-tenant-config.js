/**
 * Admin Tenant Config API Routes
 * Handles CRUD operations for tenant/company configuration
 * Endpoints:
 * - GET    /api/admin/tenant-config - Get tenant configuration
 * - PUT    /api/admin/tenant-config - Update tenant configuration
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../../shared/database/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for logo upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads/logos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.png', '.jpg', '.jpeg', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, JPEG, and SVG files are allowed'));
    }
  }
});

// Middleware to verify admin role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (decoded.role !== 'system_admin' && decoded.role !== 'support_manager') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /api/admin/tenant-config - Get tenant configuration
router.get('/', requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const [configs] = await connection.execute(
      `SELECT * FROM tenant_config WHERE tenant_id = ?`,
      [tenantId]
    );
    
    connection.release();
    
    if (configs.length === 0) {
      return res.json({ data: null });
    }
    
    const c = configs[0];
    res.json({
      ...c,
      start_time: c.working_hours_start,
      end_time: c.working_hours_end,
      working_days: c.working_days ? c.working_days.split(',') : ['Mon','Tue','Wed','Thu','Fri']
    });
  } catch (error) {
    console.error('Error fetching tenant config:', error);
    res.status(500).json({ error: 'Failed to fetch tenant configuration' });
  }
});

// POST /api/admin/tenant-config - Create or Update tenant configuration (upsert)
router.post('/', requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const {
      company_name, company_code, email_domain, website, contact_email, contact_phone, address,
      timezone, start_time, end_time, working_days,
      sla_default_response_minutes, sla_default_resolution_minutes,
      email_from_name, email_from_address, max_file_size_mb, allowed_file_types, settings
    } = req.body;
    
    const working_hours_start = start_time || req.body.working_hours_start || '09:30';
    const working_hours_end = end_time || req.body.working_hours_end || '18:30';
    const workingDaysStr = Array.isArray(working_days) ? working_days.join(',') : (working_days || 'Mon,Tue,Wed,Thu,Fri');
    
    const [configs] = await connection.execute(
      `SELECT id, company_logo FROM tenant_config WHERE tenant_id = ?`,
      [tenantId]
    );
    
    let logoPath = configs[0]?.company_logo || null;
    if (req.file) {
      if (configs[0]?.company_logo && fs.existsSync(configs[0].company_logo)) {
        fs.unlinkSync(configs[0].company_logo);
      }
      logoPath = req.file.path;
    }
    
    if (configs.length === 0) {
      const [result] = await connection.execute(
        `INSERT INTO tenant_config (tenant_id, company_name, company_code, email_domain, website, contact_email, contact_phone, address, timezone, working_hours_start, working_hours_end, working_days, sla_default_response_minutes, sla_default_resolution_minutes, email_from_name, email_from_address, max_file_size_mb, allowed_file_types, settings, company_logo, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, company_name || null, company_code || null, email_domain || null, website || null, contact_email || null, contact_phone || null, address || null, timezone || 'Asia/Kolkata', working_hours_start, working_hours_end, workingDaysStr, sla_default_response_minutes || 240, sla_default_resolution_minutes || 1440, email_from_name || null, email_from_address || null, max_file_size_mb || 10, allowed_file_types ? JSON.stringify(allowed_file_types) : null, settings ? JSON.stringify(settings) : null, logoPath, req.user.id]
      );
      
      try {
        await connection.execute(
          `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, req.user.id, req.user.name, req.user.role, 'CREATE', 'tenant_config', result.insertId, JSON.stringify({ company_name, timezone })]
        );
      } catch (e) {}
    } else {
      await connection.execute(
        `UPDATE tenant_config SET 
         company_name = ?, company_code = ?, email_domain = ?, website = ?, contact_email = ?, contact_phone = ?, address = ?,
         company_logo = ?, timezone = ?, working_hours_start = ?, working_hours_end = ?, working_days = ?, 
         sla_default_response_minutes = ?, sla_default_resolution_minutes = ?, email_from_name = ?, email_from_address = ?, 
         max_file_size_mb = ?, allowed_file_types = ?, settings = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE tenant_id = ?`,
        [company_name, company_code || null, email_domain || null, website || null, contact_email || null, contact_phone || null, address || null,
         logoPath, timezone || 'Asia/Kolkata', working_hours_start, working_hours_end, workingDaysStr,
         sla_default_response_minutes || 240, sla_default_resolution_minutes || 1440, email_from_name || null, email_from_address || null,
         max_file_size_mb || 10, allowed_file_types ? JSON.stringify(allowed_file_types) : null, settings ? JSON.stringify(settings) : null, req.user.id, tenantId]
      );
      
      try {
        await connection.execute(
          `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'tenant_config', configs[0].id, JSON.stringify({ company_name, timezone })]
        );
      } catch (e) {}
    }
    
    connection.release();
    res.json({ message: 'Tenant configuration saved successfully' });
  } catch (error) {
    console.error('Error saving tenant config:', error);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch(_) {} }
    res.status(500).json({ error: 'Failed to save tenant configuration' });
  }
});

// PUT /api/admin/tenant-config - Update tenant configuration
router.put('/', requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const tenantId = req.user.tenant_id || 1;
    
    const {
      company_name,
      timezone,
      working_hours_start,
      working_hours_end,
      working_days,
      sla_default_response_minutes,
      sla_default_resolution_minutes,
      email_from_name,
      email_from_address,
      max_file_size_mb,
      allowed_file_types,
      settings
    } = req.body;
    
    const [configs] = await connection.execute(
      `SELECT id, company_logo FROM tenant_config WHERE tenant_id = ?`,
      [tenantId]
    );
    
    if (configs.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Tenant configuration not found' });
    }
    
    let logoPath = configs[0].company_logo;
    
    if (req.file) {
      // Delete old logo
      if (configs[0].company_logo && fs.existsSync(configs[0].company_logo)) {
        fs.unlinkSync(configs[0].company_logo);
      }
      logoPath = req.file.path;
    }
    
    await connection.execute(
      `UPDATE tenant_config SET 
       company_name = ?, 
       company_logo = ?, 
       timezone = ?, 
       working_hours_start = ?, 
       working_hours_end = ?, 
       working_days = ?, 
       sla_default_response_minutes = ?, 
       sla_default_resolution_minutes = ?, 
       email_from_name = ?, 
       email_from_address = ?, 
       max_file_size_mb = ?, 
       allowed_file_types = ?, 
       settings = ?, 
       updated_by = ?, 
       updated_at = CURRENT_TIMESTAMP 
       WHERE tenant_id = ?`,
      [
        company_name,
        logoPath,
        timezone,
        working_hours_start,
        working_hours_end,
        working_days,
        sla_default_response_minutes,
        sla_default_resolution_minutes,
        email_from_name,
        email_from_address,
        max_file_size_mb,
        allowed_file_types ? JSON.stringify(allowed_file_types) : null,
        settings ? JSON.stringify(settings) : null,
        req.user.id,
        tenantId
      ]
    );
    
    // Log audit
    await connection.execute(
      `INSERT INTO audit_logs (tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, req.user.name, req.user.role, 'UPDATE', 'tenant_config', configs[0].id, 
       JSON.stringify({ company_name, timezone, working_hours: `${working_hours_start}-${working_hours_end}` })]
    );
    
    connection.release();
    
    res.json({ message: 'Tenant configuration updated successfully' });
  } catch (error) {
    console.error('Error updating tenant config:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to update tenant configuration' });
  }
});

module.exports = router;
