const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../../config.env' });

// Database configuration - set to empty for new database connection
const dbConfig = {
  host: process.env.DB_HOST || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  // Reduce stale connections (e.g. Aiven MySQL closes idle connections)
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 30000,
  maxIdle: 5
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// --- PERF instrumentation (enable with PERF_LOG=1) ---
const PERF_LOG = process.env.PERF_LOG === '1';
const PERF_DB_SLOW_MS = Number(process.env.PERF_DB_SLOW_MS || 800);
const PERF_DB_LOG_ALL = process.env.PERF_DB_LOG_ALL === '1';

const shortSql = (sql) => {
  const s = String(sql || '').replace(/\s+/g, ' ').trim();
  return s.length > 180 ? `${s.slice(0, 180)}…` : s;
};

const wrapPoolTiming = (p) => {
  if (!PERF_LOG || p.__perfWrapped) return p;
  p.__perfWrapped = true;

  const wrap = (fnName) => {
    const orig = p[fnName]?.bind(p);
    if (typeof orig !== 'function') return;
    p[fnName] = async (sql, params) => {
      const start = process.hrtime.bigint();
      try {
        return await orig(sql, params);
      } finally {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        if (PERF_DB_LOG_ALL || ms >= PERF_DB_SLOW_MS) {
          // Avoid printing large params; just signal if present.
          const hasParams = params != null && (Array.isArray(params) ? params.length > 0 : true);
          console.log(`[perf][db] ${fnName} ${ms.toFixed(1)}ms ${shortSql(sql)}${hasParams ? ' [params]' : ''}`);
        }
      }
    };
  };

  wrap('query');
  wrap('execute');
  return p;
};

wrapPoolTiming(pool);

// Handle pool errors to avoid uncaught exceptions
pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

// Force each DB session to UTC so NOW()/CURRENT_TIMESTAMP are UTC-consistent.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'", (err) => {
    if (err) {
      console.warn('⚠️ Failed to set MySQL session time_zone to UTC:', err.message);
    }
  });
});

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
  } catch (error) {
    console.error(' Database connection failed:', error.message);
    process.exit(1);
  }
};

// Initialize database tables
const initializeDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    // Create tickets table with enhanced features
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        name VARCHAR(30) NOT NULL,
        email VARCHAR(100) NOT NULL,
        mobile VARCHAR(15),
        country_code VARCHAR(10),
        description TEXT NOT NULL,
        issue_type VARCHAR(50),
        issue_type_other VARCHAR(100),
        issue_title VARCHAR(150),
        attachment_name VARCHAR(255),
        attachment_type VARCHAR(50),
        attachment LONGBLOB,
        assigned_to INT,
        assigned_by INT,
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        status ENUM('new', 'in_progress', 'closed', 'escalated') DEFAULT 'new',
        category VARCHAR(100),
        subcategory VARCHAR(100),
        satisfaction_rating INT,
        satisfaction_comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        closed_at DATETIME,
        resolution_time INT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create cases table for HCMS v2 case management
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(100),
        priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
        status ENUM('new', 'in_progress', 'resolved', 'closed', 'escalated', 'waiting', 'rejected') DEFAULT 'new',
        created_by INT,
        reporting_mode VARCHAR(50) DEFAULT 'normal',
        ticket_code VARCHAR(50),
        closed_at DATETIME,
        employee_closed TINYINT(1) DEFAULT 0,
        satisfaction_rating INT,
        reopened_at DATETIME,
        reopened_reason TEXT,
        escalation_level ENUM('L1','L2','L3','L4','L5') DEFAULT 'L1',
        escalation_count INT DEFAULT 0,
        last_escalated_at DATETIME NULL,
        is_escalated BOOLEAN DEFAULT FALSE,
        escalation_reason TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_ticket_code (ticket_code)
      )
    `);

    // Upgrade existing cases table status ENUM to include 'resolved', 'waiting', and 'rejected'
    try {
      await connection.execute(
        `ALTER TABLE cases MODIFY COLUMN status ENUM('new', 'in_progress', 'resolved', 'closed', 'escalated', 'waiting', 'rejected') DEFAULT 'new'`
      );
    } catch (e) {
      console.log('cases status ENUM upgrade skipped:', e.message);
    }
    // Ensure assigned_to column exists on cases table
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN assigned_to INT NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Ensure Department Head module columns exist on cases table
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN tenant_id INT NOT NULL DEFAULT 1`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN sla VARCHAR(100) NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN escalation_reason TEXT NULL`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.log('[database] Failed to add cases.escalation_reason:', e.message);
      }
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN subcategory VARCHAR(100) NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Department Head review status: pending_approval, under_investigation, returned_to_hr, approved, rejected, escalated_to_admin
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN dept_review_status VARCHAR(50) NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add escalation fields for level-based case routing
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN escalation_level ENUM('L1','L2','L3','L4','L5') DEFAULT 'L1'`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Ensure escalation_level is the correct ENUM type (handles existing INT columns)
    try {
      await connection.execute(`ALTER TABLE cases MODIFY COLUMN escalation_level ENUM('L1','L2','L3','L4','L5') DEFAULT 'L1'`);
    } catch (e) {
      console.log('cases escalation_level modify skipped:', e.message);
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN escalation_count INT DEFAULT 0`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN last_escalated_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE cases ADD COLUMN is_escalated BOOLEAN DEFAULT FALSE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Ensure is_escalated is NOT NULL with default FALSE
    try {
      await connection.execute(`UPDATE cases SET is_escalated = FALSE WHERE is_escalated IS NULL`);
      await connection.execute(`ALTER TABLE cases MODIFY COLUMN is_escalated BOOLEAN NOT NULL DEFAULT FALSE`);
    } catch (e) {
      console.log('cases is_escalated default update skipped:', e.message);
    }
    // Backfill: any currently-escalated case with no DH review status becomes pending_approval
    try {
      await connection.execute(`UPDATE cases SET dept_review_status = 'pending_approval' WHERE status = 'escalated' AND dept_review_status IS NULL`);
    } catch (e) {
      // Ignore if column not yet available
    }

    // Create case escalation history table for level-based escalation tracking
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS case_escalation_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        case_id INT NOT NULL,
        from_level ENUM('L1','L2','L3','L4','L5') NOT NULL,
        to_level ENUM('L1','L2','L3','L4','L5') NOT NULL,
        reason TEXT NULL,
        escalated_by INT NULL,
        escalated_by_name VARCHAR(255) NULL,
        tenant_id INT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (escalated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_case_id (case_id),
        INDEX idx_tenant_id (tenant_id)
      )
    `);

    // Create tenants table for multi-tenant support
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) NOT NULL UNIQUE,
        status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Ensure subdomain column exists on existing tenants tables
    try {
      await connection.execute(`ALTER TABLE tenants ADD COLUMN subdomain VARCHAR(100) NOT NULL DEFAULT 'default'`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE tenants ADD UNIQUE KEY uq_tenants_subdomain (subdomain)`);
    } catch (e) {
      // Ignore duplicate key or existing unique constraint errors
    }

    // Seed default tenant so foreign key constraints on tenant_id = 1 resolve
    try {
      await connection.execute(`
        INSERT INTO tenants (id, name, subdomain, status)
        VALUES (1, 'Default Tenant', 'default', 'active')
        ON DUPLICATE KEY UPDATE name = 'Default Tenant', status = 'active'
      `);
    } catch (e) {
      console.log('Note: Default tenant seed skipped:', e.message);
    }

    // Create escalation_levels table for configurable L1-L5 escalation hierarchy
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS escalation_levels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        level ENUM('L1','L2','L3','L4','L5') NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        tenant_id INT NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_tenant_level (tenant_id, level),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_level (level)
      )
    `);

    // Create escalation_level_assignments table for user-to-level mapping
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS escalation_level_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        escalation_level_id INT NOT NULL,
        tenant_id INT NOT NULL DEFAULT 1,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        assigned_by INT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (escalation_level_id) REFERENCES escalation_levels(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_escalation_level_id (escalation_level_id),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_is_active (is_active)
      )
    `);

    // Create special_case_access_permissions table for configurable special case access
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS special_case_access_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        escalation_level ENUM('L1','L2','L3','L4','L5') NOT NULL,
        ticket_type VARCHAR(50) NOT NULL,
        user_id INT NOT NULL,
        can_view TINYINT(1) DEFAULT 0,
        can_view_employee_details TINYINT(1) DEFAULT 0,
        can_edit TINYINT(1) DEFAULT 0,
        can_comment TINYINT(1) DEFAULT 0,
        can_perform_actions TINYINT(1) DEFAULT 0,
        can_resolve TINYINT(1) DEFAULT 0,
        can_close TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_special_access (tenant_id, escalation_level, ticket_type, user_id),
        INDEX idx_user_id (user_id),
        INDEX idx_tenant_level_type (tenant_id, escalation_level, ticket_type)
      )
    `);

    // Create case_escalation_consent_config table for configurable escalation consent
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS case_escalation_consent_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        ticket_type VARCHAR(50) NOT NULL,
        require_consent TINYINT(1) NOT NULL DEFAULT 0,
        override_roles TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_escalation_consent_config (tenant_id, ticket_type)
      )
    `);

    // Create case_escalation_consent table for escalation consent request history
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS case_escalation_consent (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        case_id INT NOT NULL,
        current_level ENUM('L1','L2','L3','L4','L5') NOT NULL,
        requested_level ENUM('L1','L2','L3','L4','L5') NOT NULL,
        reason TEXT NULL,
        requested_by INT NULL,
        requested_by_name VARCHAR(255) NULL,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        employee_response ENUM('pending','approved','rejected') DEFAULT 'pending',
        employee_comments TEXT NULL,
        responded_at DATETIME NULL,
        response_timestamp DATETIME NULL,
        status ENUM('pending','approved','rejected','cancelled','acknowledged') DEFAULT 'pending',
        acknowledged_by INT NULL,
        acknowledged_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_case_id (case_id),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_status (status)
      )
    `);

    // Ensure acknowledgment columns exist on existing case_escalation_consent table
    try {
      await connection.execute(`ALTER TABLE case_escalation_consent ADD COLUMN acknowledged_by INT NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE case_escalation_consent ADD COLUMN acknowledged_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE case_escalation_consent ADD CONSTRAINT fk_acknowledged_by FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL`);
    } catch (e) {
      // Ignore duplicate constraint or unsupported FK errors
    }
    try {
      await connection.execute(`ALTER TABLE case_escalation_consent MODIFY COLUMN status ENUM('pending','approved','rejected','cancelled','acknowledged') DEFAULT 'pending'`);
    } catch (e) {
      // Ignore unsupported or already-matching errors
    }

    // Create case_attachments table for multiple file support
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS case_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        case_id INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        file_size INT NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        uploaded_by INT,
        message_id VARCHAR(255),
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_case_id (case_id),
        INDEX idx_message_id (message_id)
      )
    `);

    // Ensure message_id column in case_attachments is VARCHAR(255)
    try {
      await connection.execute(`ALTER TABLE case_attachments MODIFY COLUMN message_id VARCHAR(255)`);
    } catch (e) {
      // Ignore if column doesn't exist or already correct type
    }

    // Add user_id column to tickets table if not exists (MySQL does not support IF NOT EXISTS for columns)
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN user_id INT`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Add foreign key constraint for user_id
    try {
      await connection.execute(`ALTER TABLE tickets ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`);
    } catch (e) {
      // Ignore duplicate constraint error
    }

    // Add country_code column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN country_code VARCHAR(10)`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add product_id column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN product_id INT`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Add foreign key constraint for product_id
    try {
      await connection.execute(`ALTER TABLE tickets ADD CONSTRAINT fk_product_id FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL`);
    } catch (e) {
      // Ignore duplicate constraint error
    }

    // Add assigned_to column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN assigned_to INT`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add assigned_by column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN assigned_by INT`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add priority column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium'`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add status column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN status ENUM('new', 'in_progress', 'closed', 'escalated') DEFAULT 'new'`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add issue_title column to tickets table if not exists
    try {
      await connection.execute(`ALTER TABLE tickets ADD COLUMN issue_title VARCHAR(150)`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add assignment source/reason metadata for AI/fallback/manual assignment visibility (additive).
    try {
      await connection.execute(
        `ALTER TABLE tickets ADD COLUMN assignment_source ENUM('ai','fallback','manual') NULL AFTER assigned_by`
      );
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(
        `ALTER TABLE tickets ADD COLUMN assignment_reason VARCHAR(255) NULL AFTER assignment_source`
      );
    } catch (e) {
      // Ignore duplicate column error
    }

    // assigned_to FK is added after agents table exists (below)
    try {
      await connection.execute(`ALTER TABLE tickets ADD CONSTRAINT fk_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL`);
    } catch (e) {
      // Ignore duplicate constraint error
    }

    // NOTE: replies table removed - all messages now in ticket_messages

    // Create agents table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS agents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('agent', 'manager', 'ceo') DEFAULT 'agent',
        department VARCHAR(100),
        manager_id INT,
        tenant_id INT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_login DATETIME,
        last_logout DATETIME,
        FOREIGN KEY (manager_id) REFERENCES agents(id) ON DELETE SET NULL,
        INDEX idx_agents_tenant (tenant_id)
      )
    `);

    // Ensure tenant_id column exists on agents table
    try {
      await connection.execute('ALTER TABLE agents ADD COLUMN tenant_id INT NULL DEFAULT 1');
      await connection.execute('ALTER TABLE agents ADD INDEX idx_agents_tenant (tenant_id)');
    } catch (e) {
      // ignore duplicate column/index
    }

    // Create agent_skills table (persisted agent routing skills; additive).
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS agent_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        agent_id INT NOT NULL,
        domain VARCHAR(80) NOT NULL,
        sub_skill VARCHAR(80) NOT NULL,
        proficiency ENUM('Beginner','Intermediate','Expert') NOT NULL DEFAULT 'Beginner',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_agent_skill (tenant_id, agent_id, domain, sub_skill),
        KEY idx_agent_skill_lookup (tenant_id, domain, sub_skill, proficiency),
        KEY idx_agent_skill_agent (tenant_id, agent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // assigned_to must reference agents(id) so auto-assignment (agent.id) works
    try {
      await connection.execute(`ALTER TABLE tickets ADD CONSTRAINT fk_assigned_to FOREIGN KEY (assigned_to) REFERENCES agents(id) ON DELETE SET NULL`);
    } catch (e) {
      // Ignore if FK already exists or points elsewhere (migration may have run)
    }

    // Create agent_sessions table for login/logout tracking
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agent_id INT NOT NULL,
        session_token VARCHAR(255) NOT NULL UNIQUE,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create ticket_assignments table for tracking ticket assignments
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ticket_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        agent_id INT NOT NULL,
        assigned_by INT NOT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        unassigned_at DATETIME NULL,
        assignment_reason TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        is_primary BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Add missing columns to ticket_assignments table if not exists
    try {
      await connection.execute(`ALTER TABLE ticket_assignments ADD COLUMN assignment_reason TEXT`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE ticket_assignments ADD COLUMN is_active BOOLEAN DEFAULT TRUE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE ticket_assignments ADD COLUMN unassigned_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE ticket_assignments ADD COLUMN is_primary BOOLEAN DEFAULT TRUE`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Create ticket_allocations table to store the current allocation (single row per ticket)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ticket_allocations (
        ticket_id INT PRIMARY KEY,
        agent_id INT NOT NULL,
        assigned_by INT NULL,
        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create roles table for dynamic roles
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_tenant_role (tenant_id, name)
      )
    `);

    // Create users table with role-based access
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        department VARCHAR(100),
        manager_id INT,
        phone VARCHAR(20),
        email_notifications BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        last_login DATETIME,
        FOREIGN KEY (manager_id) REFERENCES users(id)
      )
    `);

    // Add phone column to users table if not exists
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN phone VARCHAR(20)`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add email_notifications column to users table if not exists
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN welcome_url_sent BOOLEAN DEFAULT FALSE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN tenant_id INT NULL DEFAULT 1`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN verification_token_hash VARCHAR(255) NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN verification_token_expires_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN verification_sent_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN verification_send_count INT NOT NULL DEFAULT 0`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN account_status ENUM('pending_verification','active','inactive','blocked') DEFAULT 'active'`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN is_public_domain_email BOOLEAN DEFAULT FALSE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN public_domain_acknowledged BOOLEAN DEFAULT FALSE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN public_domain_acknowledged_at DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN employee_id VARCHAR(20) NULL UNIQUE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN manager_id INT NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN last_login DATETIME NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Add can_handle_confidential_cases column for confidential case handler configuration
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN can_handle_confidential_cases BOOLEAN DEFAULT 0`);
    } catch (e) {
      // Ignore duplicate column error
    }
    // Backfill employee_id for existing users
    try {
      const [rows] = await connection.execute(`SELECT id FROM users WHERE employee_id IS NULL OR employee_id = '' ORDER BY id ASC`);
      for (let i = 0; i < rows.length; i++) {
        const num = String(i + 1).padStart(3, '0');
        await connection.execute(`UPDATE users SET employee_id = ? WHERE id = ?`, [`EMP-${num}`, rows[i].id]);
      }
      if (rows.length > 0) console.log(`✅ Backfilled ${rows.length} employee IDs`);
    } catch (e) {
      console.log('employee_id backfill skipped:', e.message);
    }
    // Auto-generate employee_id for all new inserts
    try {
      await connection.execute(`
        CREATE TRIGGER IF NOT EXISTS trg_users_employee_id
        BEFORE INSERT ON users
        FOR EACH ROW
        BEGIN
          IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
            SET @max_num = (SELECT MAX(CAST(SUBSTRING(employee_id, 5) AS UNSIGNED)) FROM users WHERE employee_id IS NOT NULL);
            SET NEW.employee_id = CONCAT('EMP-', LPAD(IFNULL(@max_num, 0) + 1, 3, '0'));
          END IF;
        END
      `);
      console.log('✅ employee_id trigger ready');
    } catch (e) {
      console.log('employee_id trigger skipped:', e.message);
    }

    // Create departments table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS departments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT NULL,
          tenant_id INT NULL DEFAULT 1,
          head_id INT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_departments_tenant (tenant_id),
          INDEX idx_departments_name (name)
        )
      `);
      console.log('✅ departments table ready');
    } catch (e) {
      console.log('departments table creation skipped:', e.message);
    }

    // Add missing columns to departments table
    try { await connection.execute(`ALTER TABLE departments ADD COLUMN status ENUM('active','inactive') DEFAULT 'active'`); } catch (e) {}
    try { await connection.execute(`ALTER TABLE departments ADD COLUMN head_title VARCHAR(100) NULL`); } catch (e) {}
    try { await connection.execute(`ALTER TABLE departments ADD COLUMN created_by INT NULL`); } catch (e) {}

    // Remove duplicate departments and enforce unique name per tenant
    try {
      await connection.execute(`
        DELETE d1 FROM departments d1
        INNER JOIN departments d2
        WHERE d1.id > d2.id AND d1.name = d2.name AND (d1.tenant_id = d2.tenant_id OR (d1.tenant_id IS NULL AND d2.tenant_id IS NULL))
      `);
      await connection.execute(`ALTER TABLE departments ADD CONSTRAINT uq_departments_name UNIQUE (name)`);
      console.log('✅ Deduplicated departments and added unique name constraint');
    } catch (e) {
      console.log('Department unique constraint skipped:', e.message);
    }

    // Create department_subcategories table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS department_subcategories (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          department_id INT NOT NULL,
          name VARCHAR(100) NOT NULL,
          description TEXT NULL,
          display_order INT DEFAULT 0,
          is_active TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_dept_sub_tenant (tenant_id),
          INDEX idx_dept_sub_dept (department_id),
          UNIQUE KEY uniq_dept_subcat (department_id, name),
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        )
      `);
    } catch (e) { console.log('department_subcategories table skipped:', e.message); }

    // Deduplicate existing subcategories and enforce unique constraint on existing tables
    try {
      await connection.execute(`
        DELETE ds1 FROM department_subcategories ds1
        INNER JOIN department_subcategories ds2
        WHERE ds1.id > ds2.id
          AND ds1.department_id = ds2.department_id
          AND ds1.name = ds2.name
      `);
      await connection.execute(`
        ALTER TABLE department_subcategories ADD UNIQUE KEY uniq_dept_subcat (department_id, name)
      `);
      console.log('✅ Deduplicated and enforced unique subcategory constraint');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_ENTRY') {
        console.log('subcategory dedup/constraint skipped:', e.message);
      }
    }

    // Seed / sync correct ticket categories as departments (from CreateTicket.jsx)
    try {
      const correctCategories = {
        'HR Operations': ['Leave requests', 'Attendance issues', 'Employee information updates', 'Policy clarifications', 'Employment verification', 'Department change / Transfer'],
        'Payroll': ['Salary discrepancy', 'Payslip request', 'Reimbursement request', 'Tax queries', 'PF and ESI issues'],
        'Learning and Development': ['Training requests', 'Certification requests', 'LMS access issues', 'Course availability'],
        'Compliance': ['Policy clarification', 'Ethics concerns', 'Data privacy requests', 'Regulatory compliance issues'],
        'Administration': ['ID card requests', 'Workspace issues', 'Asset allocation', 'Facility complaints', 'Department change / Transfer'],
        'IT Support': ['Password reset', 'Login issues', 'Email access', 'Software requests', 'Hardware issues'],
        'Confidential Case Management': ['Harassment complaints', 'Whistleblower reports', 'Ethics violations', 'Workplace grievances', 'Bullying complaints']
      };

      // Remove departments that are not part of the agreed category list
      const allowedNames = Object.keys(correctCategories).map(n => `'${n}'`).join(',');
      await connection.execute(`DELETE FROM departments WHERE name NOT IN (${allowedNames})`);

      // Insert/update allowed departments and their subcategories
      for (const [deptName, subcats] of Object.entries(correctCategories)) {
        await connection.execute(
          `INSERT INTO departments (tenant_id, name, description, status) VALUES (1, ?, ?, 'active')
           ON DUPLICATE KEY UPDATE tenant_id = 1, description = VALUES(description), status = 'active'`,
          [deptName, `${deptName} case category`]
        );
        const [rows] = await connection.execute(`SELECT id FROM departments WHERE name = ?`, [deptName]);
        if (rows.length > 0) {
          const deptId = rows[0].id;
          for (let i = 0; i < subcats.length; i++) {
            await connection.execute(
              `INSERT INTO department_subcategories (department_id, name, display_order, is_active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE name=name`,
              [deptId, subcats[i], i]
            );
          }
        }
      }
      console.log('✅ Synced ticket category departments and subcategories');
    } catch (e) {
      console.log('Category department sync skipped:', e.message);
    }

    // Create ticket_statuses table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_statuses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          label VARCHAR(50) NOT NULL,
          color VARCHAR(20) DEFAULT '#6366F1',
          description TEXT NULL,
          display_order INT DEFAULT 0,
          is_active TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_status_label (tenant_id, label),
          INDEX idx_ticket_statuses_tenant (tenant_id)
        )
      `);
    } catch (e) { console.log('ticket_statuses table skipped:', e.message); }

    // Create priority_levels table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS priority_levels (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          label VARCHAR(50) NOT NULL,
          color VARCHAR(20) DEFAULT '#94A3B8',
          sla_value INT DEFAULT 1,
          sla_unit VARCHAR(20) DEFAULT 'days',
          is_active TINYINT(1) DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_priority_label (tenant_id, label),
          INDEX idx_priority_levels_tenant (tenant_id)
        )
      `);
    } catch (e) { console.log('priority_levels table skipped:', e.message); }

    // Create routing_rules table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS routing_rules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          department_id INT,
          initial_owner_role VARCHAR(50),
          escalation_owner_role VARCHAR(50),
          default_priority_id INT,
          sla_value INT DEFAULT 240,
          sla_unit VARCHAR(20) DEFAULT 'minutes',
          status ENUM('active','inactive') DEFAULT 'active',
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_routing_rules_tenant (tenant_id),
          INDEX idx_routing_rules_dept (department_id)
        )
      `);
    } catch (e) { console.log('routing_rules table skipped:', e.message); }

    // Create tenant_config table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS tenant_config (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          company_name VARCHAR(100),
          company_code VARCHAR(50),
          company_logo VARCHAR(255),
          email_domain VARCHAR(100),
          website VARCHAR(200),
          contact_email VARCHAR(100),
          contact_phone VARCHAR(20),
          address TEXT,
          timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
          working_hours_start VARCHAR(10) DEFAULT '09:30',
          working_hours_end VARCHAR(10) DEFAULT '18:30',
          working_days VARCHAR(200) DEFAULT 'Mon,Tue,Wed,Thu,Fri',
          sla_default_response_minutes INT DEFAULT 240,
          sla_default_resolution_minutes INT DEFAULT 1440,
          email_from_name VARCHAR(100),
          email_from_address VARCHAR(100),
          max_file_size_mb INT DEFAULT 10,
          allowed_file_types TEXT,
          settings JSON,
          updated_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_tenant_config_tenant (tenant_id)
        )
      `);
    } catch (e) { console.log('tenant_config table skipped:', e.message); }

    // Seed default tenant_config if empty
    try {
      const [tcCount] = await connection.execute(`SELECT COUNT(*) as cnt FROM tenant_config`);
      if (tcCount[0].cnt === 0) {
        await connection.execute(
          `INSERT INTO tenant_config (tenant_id, company_name, company_code, email_domain, contact_email) VALUES (1, 'Acme Corp', 'ACME', 'acme.com', 'admin@acme.com')`
        );
        console.log('✅ Seeded default tenant_config');
      }
    } catch (e) { console.log('tenant_config seed skipped:', e.message); }

    // Create audit_logs table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          user_id INT,
          user_name VARCHAR(100),
          user_role VARCHAR(50),
          action VARCHAR(50),
          entity_type VARCHAR(50),
          entity_id INT,
          details JSON,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_logs_tenant (tenant_id),
          INDEX idx_audit_logs_created (created_at)
        )
      `);
    } catch (e) { console.log('audit_logs table skipped:', e.message); }

    // Create policies table
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS policies (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NULL DEFAULT 1,
          name VARCHAR(200) NOT NULL,
          description TEXT,
          department_id INT,
          file_path VARCHAR(500),
          file_name VARCHAR(200),
          file_type VARCHAR(50),
          file_size INT,
          version VARCHAR(20) DEFAULT '1.0',
          is_active TINYINT(1) DEFAULT 1,
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_policies_tenant (tenant_id),
          INDEX idx_policies_dept (department_id)
        )
      `);
    } catch (e) { console.log('policies table skipped:', e.message); }

    // Backfill email_verified and account_status for users
    try {
      // Check if is_active column exists in users table
      const [columns] = await connection.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'`
      );
      const hasIsActive = columns.length > 0;
      
      if (hasIsActive) {
        await connection.execute(
          `UPDATE users
           SET email_verified = COALESCE(email_verified, 0),
               account_status = CASE
                 WHEN COALESCE(is_active, 1) = 0 THEN 'inactive'
                 WHEN COALESCE(email_verified, 0) = 1 THEN 'active'
                 WHEN account_status IS NULL OR account_status = '' THEN 'active'
                 ELSE account_status
               END`
        );
      } else {
        await connection.execute(
          `UPDATE users
           SET email_verified = COALESCE(email_verified, 0),
               account_status = CASE
                 WHEN COALESCE(email_verified, 0) = 1 THEN 'active'
                 WHEN account_status IS NULL OR account_status = '' THEN 'active'
                 ELSE account_status
               END`
        );
      }
    } catch (e) {
      console.log('users verification backfill skipped:', e.message);
    }

    // Add missing columns to users table if not exists
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN name VARCHAR(100) NOT NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN email VARCHAR(100) NOT NULL UNIQUE`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'`);
    } catch (e) {
      // Ignore duplicate column error
    }

    // Convert users.role ENUM to VARCHAR to support dynamic roles
    try {
      await connection.execute(`ALTER TABLE users MODIFY COLUMN role VARCHAR(50) DEFAULT 'user'`);
      console.log('✅ Converted users.role to VARCHAR for dynamic roles');
    } catch (e) {
      console.log('Users role VARCHAR conversion skipped:', e.message);
    }

    // Ensure users table uses 'password' column (not password_hash) for compatibility
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN password VARCHAR(255) NULL`);
    } catch (e) {
      // Ignore duplicate column error
    }
    try {
      const [cols] = await connection.execute(`SHOW COLUMNS FROM users WHERE Field = 'password_hash'`);
      if (cols.length > 0) {
        await connection.execute(`UPDATE users SET password = COALESCE(password, password_hash) WHERE password IS NULL OR password = ''`);
        await connection.execute(`ALTER TABLE users DROP COLUMN password_hash`);
        console.log('✅ Migrated password_hash to password');
      }
    } catch (e) {
      console.log('password_hash migration skipped:', e.message);
    }

    // Add product_scope_id to users table
    try {
      await connection.execute(`ALTER TABLE users ADD COLUMN product_scope_id INT NULL`);
      console.log('✅ Added users.product_scope_id column');
    } catch (e) {
      // Ignore duplicate column error
    }

    // Add foreign key constraint for product_scope_id referencing products(id)
    try {
      await connection.execute(`ALTER TABLE users ADD CONSTRAINT fk_user_product_scope FOREIGN KEY (product_scope_id) REFERENCES products(id) ON DELETE SET NULL`);
      console.log('✅ Added fk_user_product_scope foreign key');
    } catch (e) {
      // Ignore duplicate constraint error
    }

    // Create product_spoc_mapping table (kept for tenant-level product SPOC functionality)
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS product_spoc_mapping (
          spoc_user_id INT NOT NULL,
          product_id INT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (spoc_user_id, product_id),
          FOREIGN KEY (spoc_user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
      `);
      console.log('✅ Created product_spoc_mapping table');
    } catch (e) {
      console.log('product_spoc_mapping table creation failed:', e.message);
    }


    // Update agents table role ENUM to only supported staff roles
    try {
      await connection.execute(`ALTER TABLE agents MODIFY COLUMN role ENUM('support_agent', 'support_manager', 'ceo') DEFAULT 'support_agent'`);
    } catch (e) {
      // Ignore error if ENUM already updated
      console.log('Agents role ENUM update skipped (may already be updated)');
    }

    // Backfill primary_department_id for agents that have a department string but no FK ID
    try {
      // Check if tenant_id column exists in agents table
      const [columns] = await connection.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME = 'agents' AND COLUMN_NAME = 'tenant_id'`
      );
      const hasTenantId = columns.length > 0;
      
      if (hasTenantId) {
        const [agentsNeedSync] = await connection.execute(
          `SELECT a.id, a.department, a.tenant_id
           FROM agents a
           WHERE a.department IS NOT NULL
             AND a.department != ''
             AND (a.primary_department_id IS NULL OR a.primary_department_id = 0)`
        );
        if (agentsNeedSync.length > 0) {
          for (const agent of agentsNeedSync) {
            const [deptRows] = await connection.execute(
              'SELECT id FROM departments WHERE name = ? AND tenant_id = ? LIMIT 1',
              [agent.department, agent.tenant_id]
            );
            if (deptRows.length > 0) {
              await connection.execute(
                'UPDATE agents SET primary_department_id = ? WHERE id = ?',
                [deptRows[0].id, agent.id]
              );
            }
          }
          console.log(`✅ Synced primary_department_id for ${agentsNeedSync.length} agents.`);
        }
      }
    } catch (e) {
      console.log('Agent department sync skipped:', e.message);
    }

    // Create performance ratings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS performance_ratings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        executive_id INT NOT NULL,
        manager_id INT NOT NULL,
        ticket_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (executive_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);

    // NOTE: whatsapp_conversations removed - WhatsApp uses in-memory state; messages in ticket_messages

    // Create products table with built-in SLA settings
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        sla_time_minutes INT NOT NULL DEFAULT 480 COMMENT 'SLA time in minutes (8 hours default)',
        priority_level ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2',
        escalation_time_minutes INT DEFAULT 240 COMMENT 'Time before escalation in minutes (4 hours default)',
        escalation_level ENUM('manager', 'technical_manager', 'ceo') DEFAULT 'manager',
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Add slug column to products for Universal Support URL (e.g., /grc, /voiceloop)
    try {
      await connection.execute(`
        ALTER TABLE products ADD COLUMN slug VARCHAR(50) 
        COMMENT 'URL slug for support integration (e.g., grc, voiceloop)'
      `);
    } catch (e) {
      // MySQL can report duplicate column as ER_DUP_FIELDNAME or ER_DUP_FIELD depending on driver/version.
      if (e.code !== 'ER_DUP_FIELD' && e.code !== 'ER_DUP_FIELDNAME') {
        console.log('Products slug column:', e.message);
      }
    }

    // Create modules table for product sub-components
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS modules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create SLA configurations table for HRMS (department based)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sla_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_id INT NOT NULL,
        subcategory_id INT COMMENT 'Foreign key to department_subcategories for reference',
        priority_level ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2',
        response_time_minutes INT NOT NULL COMMENT 'First response time in minutes',
        resolution_time_minutes INT NOT NULL COMMENT 'Complete resolution time in minutes',
        business_hours_only BOOLEAN DEFAULT TRUE COMMENT 'Whether SLA applies only during business hours',
        escalation_warning_threshold_minutes INT COMMENT 'Warning threshold in minutes from ticket creation (e.g., response_time - 60)',
        escalation_breach_threshold_minutes INT COMMENT 'Breach threshold in minutes from ticket creation (e.g., resolution_time)',
        escalation_level ENUM('manager', 'technical_manager', 'ceo', 'department_head') DEFAULT 'department_head',
        is_active BOOLEAN DEFAULT TRUE,
        created_by INT,
        updated_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        FOREIGN KEY (subcategory_id) REFERENCES department_subcategories(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE KEY unique_sla_config (department_id)
      )
    `);

    // Drop old columns if they exist (product_id, module_id, issue_name, issue_description, category, category_description, subcategory, subcategory_description, escalation_time_minutes)
    const legacyColumns = ['product_id', 'module_id', 'issue_name', 'issue_description', 'category', 'category_description', 'subcategory', 'subcategory_description', 'escalation_time_minutes'];
    for (const column of legacyColumns) {
      try {
        await connection.execute(`ALTER TABLE sla_configurations DROP COLUMN ${column}`);
        console.log(`✅ Dropped ${column} from sla_configurations`);
      } catch (e) {
        if (e.message && e.message.includes('check that column/key exists')) {
          console.log(`⚠️ ${column} already dropped or does not exist`);
        } else {
          console.log(`⚠️ Could not drop ${column}:`, e.message);
        }
      }
    }

    // Add new escalation columns if they don't exist
    try {
      await connection.execute(`ALTER TABLE sla_configurations ADD COLUMN escalation_warning_threshold_minutes INT COMMENT 'Warning threshold in minutes from ticket creation' AFTER business_hours_only`);
      console.log('✅ Added escalation_warning_threshold_minutes column');
    } catch (e) {
      console.log('escalation_warning_threshold_minutes column already exists or error:', e.message);
    }
    try {
      await connection.execute(`ALTER TABLE sla_configurations ADD COLUMN escalation_breach_threshold_minutes INT COMMENT 'Breach threshold in minutes from ticket creation' AFTER escalation_warning_threshold_minutes`);
      console.log('✅ Added escalation_breach_threshold_minutes column');
    } catch (e) {
      console.log('escalation_breach_threshold_minutes column already exists or error:', e.message);
    }

    // Update escalation_level ENUM to include department_head
    try {
      await connection.execute(`ALTER TABLE sla_configurations MODIFY COLUMN escalation_level ENUM('manager', 'technical_manager', 'ceo', 'department_head') DEFAULT 'department_head'`);
      console.log('✅ Updated escalation_level ENUM to include department_head');
    } catch (e) {
      console.log('escalation_level ENUM update skipped:', e.message);
    }

    // Update escalations table ENUMs to include department_head
    try {
      await connection.execute(`ALTER TABLE escalations MODIFY COLUMN from_level ENUM('agent', 'manager', 'technical_manager', 'ceo', 'department_head')`);
      console.log('✅ Updated escalations.from_level ENUM to include department_head');
    } catch (e) {
      console.log('escalations.from_level ENUM update skipped:', e.message);
    }
    try {
      await connection.execute(`ALTER TABLE escalations MODIFY COLUMN to_level ENUM('manager', 'technical_manager', 'ceo', 'department_head')`);
      console.log('✅ Updated escalations.to_level ENUM to include department_head');
    } catch (e) {
      console.log('escalations.to_level ENUM update skipped:', e.message);
    }

    // Add subcategory_id column if it doesn't exist
    try {
      await connection.execute(`ALTER TABLE sla_configurations ADD COLUMN subcategory_id INT COMMENT 'Foreign key to department_subcategories' AFTER department_id`);
      console.log('✅ Added subcategory_id column to sla_configurations');
    } catch (e) {
      console.log('subcategory_id column already exists or error:', e.message);
    }

    // Remove non-P2 SLA configurations so each department has only one SLA
    try {
      const [deleted] = await connection.execute(`DELETE FROM sla_configurations WHERE priority_level != 'P2'`);
      console.log(`✅ Removed ${deleted.affectedRows} non-P2 SLA configurations`);
    } catch (e) {
      console.log('Non-P2 SLA cleanup skipped:', e.message);
    }

    // Update unique constraint
    try {
      await connection.execute(`ALTER TABLE sla_configurations DROP INDEX unique_sla_config`);
    } catch (e) {
      console.log('Old unique constraint drop skipped:', e.message);
    }
    try {
      await connection.execute(`ALTER TABLE sla_configurations ADD UNIQUE KEY unique_sla_config (department_id)`);
      console.log('✅ Updated unique constraint for sla_configurations');
    } catch (e) {
      console.log('Unique constraint update skipped:', e.message);
    }

    // Insert default SLA configurations for HRMS departments
    try {
      // Get department IDs
      const [departments] = await connection.execute(`SELECT id, name FROM departments WHERE name IN ('HR Operations', 'Payroll', 'Learning & Development', 'Compliance', 'Administration', 'IT Support', 'Confidential Case Management')`);
      
      const deptMap = {};
      departments.forEach(dept => {
        deptMap[dept.name] = dept.id;
      });

      // SLA configurations per department (default P2 only)
      const slaConfigs = [
        { dept: 'HR Operations', response: 240, resolution: 960 },
        { dept: 'Payroll', response: 120, resolution: 480 },
        { dept: 'Learning & Development', response: 480, resolution: 1440 },
        { dept: 'Compliance', response: 120, resolution: 480 },
        { dept: 'Administration', response: 480, resolution: 1440 },
        { dept: 'IT Support', response: 60, resolution: 480 },
        { dept: 'Confidential Case Management', response: 60, resolution: 1440 }
      ];

      for (const config of slaConfigs) {
        if (deptMap[config.dept]) {
          const [existing] = await connection.execute(
            `SELECT id FROM sla_configurations WHERE department_id = ?`,
            [deptMap[config.dept]]
          );
          
          if (existing.length === 0) {
            await connection.execute(
              `INSERT INTO sla_configurations (department_id, response_time_minutes, resolution_time_minutes, priority_level, business_hours_only, is_active, created_by) VALUES (?, ?, ?, 'P2', TRUE, TRUE, (SELECT id FROM users WHERE role = 'system_admin' LIMIT 1))`,
              [deptMap[config.dept], config.response, config.resolution]
            );
            console.log(`✅ Inserted SLA configuration for ${config.dept} - P2`);
          } else {
            console.log(`ℹ️ SLA configuration for ${config.dept} already exists`);
          }
        } else {
          console.log(`⚠️ Department '${config.dept}' not found, skipping SLA configuration`);
        }
      }

      // Backfill existing SLA configurations with NULL created_by to the first system admin
      try {
        const [adminRows] = await connection.execute(`SELECT id FROM users WHERE role = 'system_admin' AND is_active = TRUE LIMIT 1`);
        if (adminRows.length > 0) {
          const adminId = adminRows[0].id;
          await connection.execute(
            `UPDATE sla_configurations SET created_by = ? WHERE created_by IS NULL`,
            [adminId]
          );
          console.log('✅ Backfilled SLA configuration creators to admin id:', adminId);
        } else {
          console.log('⚠️ No active system_admin found for SLA creator backfill');
        }
      } catch (backfillErr) {
        console.log('SLA creator backfill skipped:', backfillErr.message);
      }
    } catch (e) {
      console.log('SLA configuration seeding skipped:', e.message);
    }

    // Create SLA timers table to track SLA compliance
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS sla_timers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        sla_configuration_id INT NOT NULL,
        timer_type ENUM('response', 'resolution', 'escalation') NOT NULL,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        pause_time DATETIME NULL,
        resume_time DATETIME NULL,
        total_elapsed_minutes INT DEFAULT 0,
        sla_deadline DATETIME NOT NULL,
        status ENUM('active', 'paused', 'completed', 'breached') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (sla_configuration_id) REFERENCES sla_configurations(id) ON DELETE CASCADE
      )
    `);

    // Fix sla_timers foreign key to reference cases instead of tickets
    try {
      await connection.execute(`ALTER TABLE sla_timers DROP FOREIGN KEY sla_timers_ibfk_1`);
      console.log('✅ Dropped old tickets foreign key from sla_timers');
    } catch (e) {
      console.log('Drop foreign key skipped:', e.message);
    }
    try {
      await connection.execute(`ALTER TABLE sla_timers ADD CONSTRAINT fk_sla_timers_case FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE`);
      console.log('✅ Added cases foreign key to sla_timers');
    } catch (e) {
      console.log('Add cases foreign key skipped:', e.message);
    }

    // Create escalations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS escalations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        sla_timer_id INT NOT NULL,
        from_level ENUM('agent', 'manager', 'technical_manager', 'ceo', 'department_head') NOT NULL,
        to_level ENUM('manager', 'technical_manager', 'ceo', 'department_head') NOT NULL,
        reason TEXT,
        escalated_by INT NOT NULL,
        escalated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'in_progress', 'resolved') DEFAULT 'pending',
        resolved_at DATETIME NULL,
        FOREIGN KEY (sla_timer_id) REFERENCES sla_timers(id) ON DELETE CASCADE,
        FOREIGN KEY (escalated_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Fix escalations foreign key to reference cases instead of tickets
    try {
      await connection.execute(`ALTER TABLE escalations DROP FOREIGN KEY escalations_ibfk_1`);
      console.log('✅ Dropped old tickets foreign key from escalations');
    } catch (e) {
      console.log('Drop escalations foreign key skipped:', e.message);
    }
    try {
      await connection.execute(`ALTER TABLE escalations ADD CONSTRAINT fk_escalations_case FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE`);
      console.log('✅ Added cases foreign key to escalations');
    } catch (e) {
      console.log('Add escalations cases foreign key skipped:', e.message);
    }

    // NOTE: chat_messages removed - all messages now in ticket_messages

    // Create unified ticket_messages table - single conversation thread for all channels
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        ticket_id INT NOT NULL,
        conversation_key VARCHAR(255) NULL,
        sender_type ENUM('user', 'agent', 'system') NOT NULL,
        sender_id INT NULL,
        sender_name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        channel ENUM('email', 'whatsapp', 'platform_chat') NOT NULL,
        external_id VARCHAR(255) NULL,
        requires_ack BOOLEAN DEFAULT FALSE,
        acknowledged_at DATETIME NULL,
        acknowledged_by VARCHAR(255) NULL,
        is_read BOOLEAN DEFAULT FALSE,
        read_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_conversation_key (conversation_key),
        INDEX idx_created_at (created_at),
        INDEX idx_channel (channel),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      )
    `);
    try {
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN conversation_key VARCHAR(255) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('ticket_messages.conversation_key:', e.message);
    }
    try {
      await connection.execute('CREATE INDEX idx_conversation_key ON ticket_messages (conversation_key)');
    } catch (e) {
      // Ignore duplicate index
    }
    try {
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN requires_ack BOOLEAN DEFAULT FALSE');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('ticket_messages.requires_ack:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN acknowledged_at DATETIME NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('ticket_messages.acknowledged_at:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN acknowledged_by VARCHAR(255) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('ticket_messages.acknowledged_by:', e.message);
    }

    // Create chat_sessions table to track active chat sessions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        session_id VARCHAR(100) UNIQUE NOT NULL,
        agent_id INT NULL,
        customer_id INT NULL,
        status ENUM('active', 'paused', 'closed') DEFAULT 'active',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_session_id (session_id),
        INDEX idx_ticket_id (ticket_id),
        INDEX idx_status (status)
      )
    `);

    // Create chat_participants table to track who's in each chat
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        user_id INT NULL,
        user_type ENUM('agent', 'customer') NOT NULL,
        user_name VARCHAR(100) NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        left_at DATETIME NULL,
        is_typing BOOLEAN DEFAULT FALSE,
        last_typing_at DATETIME NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_session_id (session_id),
        INDEX idx_user_type (user_type)
      )
    `);

    // Create current_assignments view for easy access to active assignments
    await connection.execute(`
      CREATE OR REPLACE VIEW current_assignments AS
      SELECT 
        ta.id as assignment_id,
        ta.ticket_id,
        ta.agent_id,
        u.name as agent_name,
        u.email as agent_email,
        u.role as agent_role,
        ta.assigned_by,
        assigned_by_user.name as assigned_by_name,
        ta.assigned_at,
        'manual' as assignment_type,
        COALESCE(t.priority, 'medium') as priority_level,
        ta.assignment_reason as assignment_notes,
        COALESCE(ta.is_primary, TRUE) as is_primary,
        COALESCE(t.status, 'new') as ticket_status,
        COALESCE(t.issue_title, t.description) as issue_title,
        t.created_at as ticket_created
      FROM ticket_assignments ta
      JOIN tickets t ON ta.ticket_id = t.id
      JOIN users u ON ta.agent_id = u.id
      LEFT JOIN users assigned_by_user ON ta.assigned_by = assigned_by_user.id
      WHERE ta.is_active = TRUE
    `);

    // Create assignment_history view for tracking assignment changes
    await connection.execute(`
      CREATE OR REPLACE VIEW assignment_history AS
      SELECT 
        ta.id as assignment_id,
        ta.ticket_id,
        ta.agent_id,
        u.name as agent_name,
        ta.assigned_by,
        assigned_by_user.name as assigned_by_name,
        ta.assigned_at,
        ta.unassigned_at,
        CASE 
          WHEN ta.is_active = TRUE THEN 'active'
          WHEN ta.unassigned_at IS NOT NULL THEN 'completed'
          ELSE 'inactive'
        END as status,
        'manual' as assignment_type,
        ta.assignment_reason as assignment_notes,
        CASE 
          WHEN ta.unassigned_at IS NOT NULL THEN 
            TIMESTAMPDIFF(MINUTE, ta.assigned_at, ta.unassigned_at)
          ELSE NULL
        END as duration_minutes,
        COALESCE(t.issue_title, t.description) as issue_title,
        COALESCE(t.status, 'new') as ticket_status
      FROM ticket_assignments ta
      JOIN tickets t ON ta.ticket_id = t.id
      JOIN users u ON ta.agent_id = u.id
      LEFT JOIN users assigned_by_user ON ta.assigned_by = assigned_by_user.id
    `);

    // Create agent_workload view for performance monitoring
    await connection.execute(`
      CREATE OR REPLACE VIEW agent_workload AS
      SELECT 
        u.id as agent_id,
        u.name as agent_name,
        u.email as agent_email,
        u.role as agent_role,
        COUNT(ta.id) as total_active_assignments,
        COUNT(CASE WHEN COALESCE(ta.is_primary, TRUE) = TRUE THEN 1 END) as primary_assignments,
        COUNT(CASE WHEN COALESCE(t.priority, 'medium') = 'urgent' THEN 1 END) as urgent_tickets,
        COUNT(CASE WHEN COALESCE(t.priority, 'medium') = 'high' THEN 1 END) as high_priority_tickets,
        ROUND(AVG(CASE 
          WHEN ta.unassigned_at IS NOT NULL THEN 
            TIMESTAMPDIFF(MINUTE, ta.assigned_at, ta.unassigned_at)
          ELSE NULL
        END), 2) as avg_workload_score,
        MIN(ta.assigned_at) as oldest_assignment,
        MAX(ta.assigned_at) as newest_assignment
      FROM users u
      LEFT JOIN ticket_assignments ta ON u.id = ta.agent_id AND ta.is_active = TRUE
      LEFT JOIN tickets t ON ta.ticket_id = t.id
      WHERE u.role IN ('agent', 'support_agent', 'support_manager')
      GROUP BY u.id, u.name, u.email, u.role
    `);

    // Manager Override: ticket_activity table and is_internal on ticket_messages
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_activity (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          ticket_id INT NOT NULL,
          action VARCHAR(50) NOT NULL,
          performed_by INT NOT NULL,
          performed_by_name VARCHAR(100),
          details JSON,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_tenant_id (tenant_id),
          INDEX idx_action (action),
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
      `);
    } catch (e) {
      console.log('Note: ticket_activity may already exist:', e.message);
    }

    // HCMS uses cases.id, not tickets.id. Drop the wrong FK constraint so activity logging works.
    try {
      const [fkRows] = await connection.execute(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'ticket_activity'
           AND REFERENCED_TABLE_NAME = 'tickets'
           AND REFERENCED_COLUMN_NAME = 'id'`
      );
      if (fkRows.length > 0) {
        const fkName = fkRows[0].CONSTRAINT_NAME;
        await connection.execute(`ALTER TABLE ticket_activity DROP FOREIGN KEY \`${fkName}\``);
        console.log('✅ Dropped ticket_activity foreign key referencing tickets.id');
      }
    } catch (fkErr) {
      console.log('Note: Could not drop ticket_activity FK:', fkErr.message);
    }

    try {
      await connection.execute('ALTER TABLE ticket_messages ADD COLUMN is_internal BOOLEAN DEFAULT FALSE');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('Note: is_internal may already exist:', e.message);
    }

    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_first_response_met TINYINT(1) NULL COMMENT \'1=SLA met, 0=breached, NULL=no first response yet\'');
      console.log('✅ Added sla_first_response_met column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') { /* column exists */ } else { console.log('Note: sla_first_response_met:', e.message); }
    }

    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_reminder_30_sent TINYINT(1) DEFAULT 0 COMMENT \'1=30min reminder sent\'');
      console.log('✅ Added sla_reminder_30_sent column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') { /* column exists */ }
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_reminder_15_sent TINYINT(1) DEFAULT 0 COMMENT \'1=15min urgent reminder sent\'');
      console.log('✅ Added sla_reminder_15_sent column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') { /* column exists */ }
    }

    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN inactivity_reminder_level TINYINT DEFAULT 0 COMMENT \'0=none, 1=12h, 2=24h, 3=36h, 4=closed\'');
      console.log('✅ Added inactivity_reminder_level column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') { /* column exists */ }
    }

    // Compatibility sync for fresh DBs: ensure runtime-required columns/tables exist.
    // This keeps new environments aligned with route queries/inserts.
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.tenant_id:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN product VARCHAR(100)');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.product:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN module VARCHAR(100)');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.module:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN module_id INT');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.module_id:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN utm_description VARCHAR(255)');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.utm_description:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN first_response_at DATETIME NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.first_response_at:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN resolved_at DATETIME NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.resolved_at:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN group_title VARCHAR(255) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.group_title:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN group_internal_note TEXT NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.group_internal_note:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN grouped_at DATETIME NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('tickets.grouped_at:', e.message);
    }
    try {
      await connection.execute(
        "ALTER TABLE tickets MODIFY COLUMN status ENUM('new','in_progress','resolved','closed','escalated') DEFAULT 'new'"
      );
    } catch (e) {
      console.log('tickets.status enum sync skipped:', e.message);
    }

    try {
      await connection.execute('ALTER TABLE products ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('products.tenant_id:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE products ADD COLUMN utm_description VARCHAR(100) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('products.utm_description:', e.message);
    }
    try {
      await connection.execute(
        "ALTER TABLE products ADD COLUMN priority_allocation_type VARCHAR(30) NOT NULL DEFAULT 'ai_only'"
      );
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('products.priority_allocation_type:', e.message);
    }

    try {
      await connection.execute('ALTER TABLE modules ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('modules.tenant_id:', e.message);
    }
    try {
      await connection.execute(
        "ALTER TABLE modules ADD COLUMN priority_allocation_type VARCHAR(30) NOT NULL DEFAULT 'ai_only'"
      );
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('modules.priority_allocation_type:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE sla_configurations ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('sla_configurations.tenant_id:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE sla_timers ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('sla_timers.tenant_id:', e.message);
    }

    try {
      await connection.execute('ALTER TABLE escalations ADD COLUMN tenant_id INT NOT NULL DEFAULT 1');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('escalations.tenant_id:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE escalations ADD COLUMN escalated_from VARCHAR(50) NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('escalations.escalated_from:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE escalations ADD COLUMN escalated_to INT NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('escalations.escalated_to:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE escalations ADD COLUMN escalation_reason TEXT NULL');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('escalations.escalation_reason:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE escalations MODIFY COLUMN sla_timer_id INT NULL');
    } catch (e) {
      console.log('escalations.sla_timer_id nullable sync skipped:', e.message);
    }

    // FAQ module archived - moved to archive/backend/routes/faqs.js
    // try {
    //   await connection.execute(`
    //     CREATE TABLE IF NOT EXISTS faqs (
    //       id INT AUTO_INCREMENT PRIMARY KEY,
    //       tenant_id INT NOT NULL DEFAULT 1,
    //       product VARCHAR(100) NOT NULL,
    //       category VARCHAR(100) NOT NULL,
    //       question TEXT NOT NULL,
    //       answer TEXT NOT NULL,
    //       tags TEXT NULL,
    //       faq_embedding JSON NULL,
    //       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    //       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    //       INDEX idx_faqs_tenant (tenant_id),
    //       INDEX idx_faqs_product (product),
    //       INDEX idx_faqs_category (category)
    //     )
    //   `);
    // } catch (e) {
    //   console.log('faqs table sync skipped:', e.message);
    // }

    // // Backwards-compatible: ensure optional tags column exists for keyword search.
    // try {
    //   await connection.execute('ALTER TABLE faqs ADD COLUMN tags TEXT NULL');
    // } catch (e) {
    //   if (e.code !== 'ER_DUP_FIELDNAME') console.log('faqs.tags:', e.message);
    // }

    // try {
    //   await connection.execute('ALTER TABLE faqs ADD COLUMN faq_embedding JSON NULL');
    // } catch (e) {
    //   if (e.code !== 'ER_DUP_FIELDNAME') console.log('faqs.faq_embedding:', e.message);
    // }

    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_resolution_details (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          ticket_id INT NOT NULL,
          resolution_summary TEXT NOT NULL,
          internal_steps TEXT NOT NULL,
          root_cause TEXT NULL,
          fix_type ENUM('Configuration Issue','Data Fix','Code Fix','User Error','External Dependency') NOT NULL,
          reference_data VARCHAR(500) NULL,
          created_by INT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_ticket_resolution_details_ticket (ticket_id),
          INDEX idx_ticket_resolution_details_tenant_ticket (tenant_id, ticket_id),
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
      `);
    } catch (e) {
      console.log('ticket_resolution_details table sync skipped:', e.message);
    }

    // Department Head module tables
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_notes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          note TEXT NOT NULL,
          author VARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE
        )
      `);
    } catch (e) {
      console.log('ticket_notes table sync skipped:', e.message);
    }

    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_comments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          user_id INT NULL,
          message TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
    } catch (e) {
      console.log('ticket_comments table sync skipped:', e.message);
    }

    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_attachments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_size VARCHAR(50) NOT NULL,
          file_type VARCHAR(50) NOT NULL,
          file_path VARCHAR(500) NOT NULL,
          uploaded_by INT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_created_at (created_at),
          FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE,
          FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
    } catch (e) {
      console.log('ticket_attachments table sync skipped:', e.message);
    }

    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS support_calls (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          product VARCHAR(100) NOT NULL,
          context JSON NULL,
          current_page VARCHAR(255) NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          source VARCHAR(100) DEFAULT 'external_integration',
          status ENUM('pending','in_progress','resolved','closed') DEFAULT 'pending',
          assigned_to INT NULL,
          resolution_notes TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_support_calls_user (user_id),
          INDEX idx_support_calls_product (product),
          INDEX idx_support_calls_status (status)
        )
      `);
    } catch (e) {
      console.log('support_calls table sync skipped:', e.message);
    }

    // --- Audit logs (admin activity tracking) ---
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          user_name VARCHAR(255) NULL,
          user_email VARCHAR(255) NULL,
          user_role VARCHAR(50) NULL,
          tenant_id INT NOT NULL DEFAULT 1,
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50) NULL,
          entity_id INT NULL,
          entity_name VARCHAR(255) NULL,
          old_values JSON NULL,
          new_values JSON NULL,
          details JSON NULL,
          ip_address VARCHAR(45) NULL,
          user_agent TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_tenant_id (tenant_id),
          INDEX idx_user_id (user_id),
          INDEX idx_action (action),
          INDEX idx_entity_type (entity_type),
          INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Ensured audit_logs table');
    } catch (e) {
      console.log('audit_logs table sync skipped:', e.message);
    }
    try {
      await connection.execute('ALTER TABLE audit_logs ADD COLUMN details JSON NULL');
      console.log('✅ Ensured audit_logs.details column');
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') console.log('audit_logs.details column:', e.message);
    }

    // --- In-app notifications (role-targeted; CEO sees all via API) ---
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS app_notifications (
          id CHAR(36) NOT NULL,
          tenant_id INT NOT NULL DEFAULT 1,
          recipient_role VARCHAR(20) NOT NULL,
          recipient_staff_id INT NULL,
          recipient_user_id INT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          type VARCHAR(40) NOT NULL,
          ticket_id INT NULL,
          is_read TINYINT(1) NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          dedupe_key VARCHAR(190) NULL,
          PRIMARY KEY (id),
          KEY idx_app_notif_tenant_created (tenant_id, created_at),
          KEY idx_app_notif_staff (tenant_id, recipient_staff_id, recipient_role, is_read),
          KEY idx_app_notif_user (tenant_id, recipient_user_id, recipient_role, is_read),
          KEY idx_app_notif_ticket (tenant_id, ticket_id),
          UNIQUE KEY uniq_app_notif_dedupe (tenant_id, dedupe_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) {
      console.warn('⚠️ Could not ensure app_notifications table:', e?.message || e);
    }

    // --- Pending info request tracking ---
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS ticket_info_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          ticket_id INT NOT NULL,
          requester_id INT NOT NULL,
          requester_name VARCHAR(100),
          message TEXT NOT NULL,
          status ENUM('pending', 'fulfilled', 'cancelled') DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          fulfilled_at DATETIME NULL,
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_status (status),
          INDEX idx_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Ensured ticket_info_requests table');
      
      // Add message_id column to ticket_info_requests for linking attachments
      try {
        await connection.execute(`ALTER TABLE ticket_info_requests ADD COLUMN message_id VARCHAR(255)`);
      } catch (e) {
        // Ignore duplicate column error
      }
    } catch (e) {
      console.warn('⚠️ Could not ensure ticket_info_requests table:', e?.message || e);
    }

    // --- Global system settings (simple key/value store) ---
    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS system_settings (
          \`key\` VARCHAR(100) PRIMARY KEY,
          \`value\` TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) {
      console.warn('⚠️ Could not ensure system_settings table:', e?.message || e);
    }

    // --- Email Intake Support ---
    try {
      await connection.execute('ALTER TABLE users ADD COLUMN is_external BOOLEAN DEFAULT FALSE AFTER tenant_id');
    } catch (e) { /* ignore */ }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN source VARCHAR(50) DEFAULT "web" AFTER status');
    } catch (e) { /* ignore */ }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_config_id INT AFTER source');
    } catch (e) { /* ignore */ }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_response_time_minutes INT AFTER sla_config_id');
    } catch (e) { /* ignore */ }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_resolution_time_minutes INT AFTER sla_response_time_minutes');
    } catch (e) { /* ignore */ }
    try {
      await connection.execute('ALTER TABLE tickets ADD COLUMN sla_match_level VARCHAR(50) AFTER sla_resolution_time_minutes');
    } catch (e) { /* ignore */ }

    // Organization table removed - now using tenant-level SPOC approach
    // Each tenant acts as a single organization

    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS incoming_emails (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          sender_email VARCHAR(255) NOT NULL,
          sender_name VARCHAR(255),
          subject VARCHAR(255),
          body LONGTEXT,
          html_body LONGTEXT,
          message_id VARCHAR(255),
          thread_id VARCHAR(255),
          received_at DATETIME NOT NULL,
          processing_status ENUM('pending', 'processed', 'review_required', 'pending_review', 'ignored', 'spam', 'pending_continuation_review', 'converted_to_ticket') DEFAULT 'pending',
          email_type VARCHAR(50),
          existing_user_id INT,
          validation_result JSON,
          ai_extracted_fields JSON,
          linked_ticket_id INT,
          matched_ticket_id INT DEFAULT NULL,
          ai_confidence_score DECIMAL(4,3) DEFAULT NULL,
          ai_continuation_reason TEXT DEFAULT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ie_message_id (message_id),
          INDEX idx_ie_status (processing_status),
          FOREIGN KEY (linked_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
          FOREIGN KEY (matched_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
          FOREIGN KEY (existing_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) { console.warn('⚠️ Could not ensure incoming_emails table:', e.message); }

    try {
      await connection.execute('ALTER TABLE incoming_emails ADD COLUMN email_type VARCHAR(50)');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('incoming_emails.email_type:', e.message); }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD COLUMN existing_user_id INT');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('incoming_emails.existing_user_id:', e.message); }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD CONSTRAINT fk_ie_user FOREIGN KEY (existing_user_id) REFERENCES users(id) ON DELETE SET NULL');
    } catch (e) { /* ignore duplicate constraint */ }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD COLUMN ai_extracted_fields JSON');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('incoming_emails.ai_extracted_fields:', e.message); }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD COLUMN matched_ticket_id INT DEFAULT NULL');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('incoming_emails.matched_ticket_id:', e.message); }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD CONSTRAINT fk_ie_matched_ticket FOREIGN KEY (matched_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL');
    } catch (e) { /* ignore duplicate constraint */ }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD COLUMN ai_confidence_score DECIMAL(4,3) DEFAULT NULL');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('incoming_emails.ai_confidence_score:', e.message); }
    try {
      await connection.execute('ALTER TABLE incoming_emails ADD COLUMN ai_continuation_reason TEXT DEFAULT NULL');
    } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') console.log('incoming_emails.ai_continuation_reason:', e.message); }
    try {
      await connection.execute('ALTER TABLE incoming_emails MODIFY COLUMN processing_status ENUM("pending", "processed", "review_required", "pending_review", "ignored", "spam", "pending_continuation_review", "converted_to_ticket") DEFAULT "pending"');
    } catch (e) { console.log('incoming_emails processing_status enum sync skipped:', e.message); }

    try {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS mail_review_queue (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tenant_id INT NOT NULL DEFAULT 1,
          email_id INT NOT NULL,
          review_status ENUM('pending', 'approved', 'rejected', 'ignored') DEFAULT 'pending',
          reviewed_by INT,
          review_action ENUM('create_ticket', 'link_ticket', 'ignore', 'mark_spam'),
          review_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (email_id) REFERENCES incoming_emails(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) { console.warn('⚠️ Could not ensure mail_review_queue table:', e.message); }

    // Default: AI allocation enabled (do not overwrite if it already exists)
    try {
      await connection.execute(
        `INSERT IGNORE INTO system_settings (\`key\`, \`value\`) VALUES (?, ?)`,
        ['ai_ticket_allocation_enabled', 'true']
      );
    } catch (e) {
      console.warn('⚠️ Could not insert default ai_ticket_allocation_enabled:', e?.message || e);
    }

    // Product to Organizations table removed - products are now tenant-scoped only

    // Seed default roles for each tenant
    try {
      const defaultRoles = [
        { name: 'employee', description: 'Employee who can raise and track tickets' },
        { name: 'hr_executive', description: 'HR executive who manages employee cases' },
        { name: 'department_head', description: 'Department head who handles escalated tickets' },
        { name: 'system_admin', description: 'System administrator with full access' },
        { name: 'hr_manager', description: 'HR manager who handles assigned cases' },
        { name: 'ceo', description: 'CEO executive dashboard for assigned cases' }
      ];
      const [tenants] = await connection.execute(`SELECT id FROM tenants`);
      const tenantIds = tenants.length > 0 ? tenants.map(t => t.id) : [1];
      for (const tenantId of tenantIds) {
        for (const role of defaultRoles) {
          await connection.execute(
            `INSERT INTO roles (tenant_id, name, description, is_active) VALUES (?, ?, ?, TRUE) ON DUPLICATE KEY UPDATE description=VALUES(description), is_active=VALUES(is_active)`,
            [tenantId, role.name, role.description]
          );
        }
      }
      console.log('✅ Default roles seeded');
    } catch (e) {
      console.log('Default roles seeding skipped:', e.message);
    }

    console.log('✅ Database tables and views initialized successfully');
    connection.release();
  } catch (error) {
    console.error(' Database initialization failed:', error.message);
    throw error;
  }
};

module.exports = {
  pool,
  testConnection,
  initializeDatabase
}; 