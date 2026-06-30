/**
 * Migration: Add Admin UI Tables
 * Purpose: Support the new Admin UI screens (Policies, Routing Rules, Permissions, Departments with subcategories)
 * These tables are needed because the UI was designed with specific entities that don't exist in the current schema.
 */

const { pool } = require('../../shared/database/database');

async function up() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Role mapping table - bridges frontend roles with backend roles
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS role_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        frontend_role ENUM('employee','hr_executive','department_head','system_admin') NOT NULL,
        backend_role ENUM('user','agent','manager','support_manager','ceo','business_team') NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_role_mapping (tenant_id, frontend_role),
        KEY idx_role_mapping_tenant (tenant_id),
        CONSTRAINT fk_role_mapping_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. Departments table with subcategories
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        name VARCHAR(100) NOT NULL,
        description TEXT NULL,
        head_id INT NULL,
        head_title VARCHAR(100) NULL,
        status ENUM('active','inactive') DEFAULT 'active',
        created_by INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dept_tenant_name (tenant_id, name),
        KEY idx_dept_tenant (tenant_id),
        KEY idx_dept_status (status),
        CONSTRAINT fk_dept_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_dept_head FOREIGN KEY (head_id) REFERENCES agents(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 3. Department subcategories
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS department_subcategories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        department_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT NULL,
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_subcat_dept_name (department_id, name),
        KEY idx_subcat_tenant (tenant_id),
        KEY idx_subcat_dept (department_id),
        CONSTRAINT fk_subcat_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_subcat_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 4. Ticket statuses (customizable lifecycle states)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ticket_statuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        label VARCHAR(50) NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#6366F1',
        description TEXT NULL,
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_status_tenant_label (tenant_id, label),
        KEY idx_status_tenant (tenant_id),
        KEY idx_status_active (is_active),
        CONSTRAINT fk_status_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 5. Priority levels with SLA
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS priority_levels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        label VARCHAR(50) NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#94A3B8',
        sla_value INT NOT NULL,
        sla_unit ENUM('minutes','hours','days') DEFAULT 'days',
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_priority_tenant_label (tenant_id, label),
        KEY idx_priority_tenant (tenant_id),
        KEY idx_priority_active (is_active),
        CONSTRAINT fk_priority_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 6. Routing rules
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS routing_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        department_id INT NOT NULL,
        initial_owner_role VARCHAR(50) NOT NULL,
        escalation_owner_role VARCHAR(50) NOT NULL,
        default_priority_id INT NULL,
        sla_value INT NOT NULL,
        sla_unit ENUM('minutes','hours','days') DEFAULT 'days',
        status ENUM('active','inactive') DEFAULT 'active',
        created_by INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_routing_tenant (tenant_id),
        KEY idx_routing_dept (department_id),
        KEY idx_routing_status (status),
        CONSTRAINT fk_routing_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_routing_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
        CONSTRAINT fk_routing_priority FOREIGN KEY (default_priority_id) REFERENCES priority_levels(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 7. Policies
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        name VARCHAR(200) NOT NULL,
        department_id INT NULL,
        version VARCHAR(20) DEFAULT 'V1.0',
        description TEXT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size_kb INT NULL,
        file_type VARCHAR(20) NOT NULL,
        uploaded_by INT NULL,
        uploader_name VARCHAR(100) NULL,
        status ENUM('active','disabled') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_policy_tenant (tenant_id),
        KEY idx_policy_dept (department_id),
        KEY idx_policy_status (status),
        CONSTRAINT fk_policy_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_policy_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 8. Role permissions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        role ENUM('employee','hr_executive','department_head','system_admin') NOT NULL,
        permission_key VARCHAR(100) NOT NULL,
        is_allowed TINYINT(1) DEFAULT 0,
        updated_by INT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_role_perm (tenant_id, role, permission_key),
        KEY idx_role_perm_tenant (tenant_id),
        KEY idx_role_perm_role (role),
        CONSTRAINT fk_role_perm_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 9. Audit logs (for AdminActivity screen)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        user_id INT NULL,
        user_name VARCHAR(100) NULL,
        user_role VARCHAR(50) NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INT NULL,
        details JSON NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_audit_tenant (tenant_id),
        KEY idx_audit_user (user_id),
        KEY idx_audit_action (action),
        KEY idx_audit_entity (entity_type, entity_id),
        KEY idx_audit_created (created_at),
        CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 10. Tenant configuration (for AdminTenantConfig)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        company_name VARCHAR(200) NOT NULL,
        company_logo VARCHAR(500) NULL,
        timezone VARCHAR(50) DEFAULT 'UTC',
        working_hours_start TIME DEFAULT '09:00:00',
        working_hours_end TIME DEFAULT '18:00:00',
        working_days VARCHAR(20) DEFAULT '1,2,3,4,5',
        sla_default_response_minutes INT DEFAULT 480,
        sla_default_resolution_minutes INT DEFAULT 2880,
        email_from_name VARCHAR(100) NULL,
        email_from_address VARCHAR(200) NULL,
        max_file_size_mb INT DEFAULT 10,
        allowed_file_types JSON NULL,
        settings JSON NULL,
        updated_by INT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tenant_config (tenant_id),
        CONSTRAINT fk_tenant_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Insert default role mappings
    await connection.execute(`
      INSERT INTO role_mappings (tenant_id, frontend_role, backend_role) VALUES
      (1, 'employee', 'user'),
      (1, 'hr_executive', 'agent'),
      (1, 'department_head', 'manager'),
      (1, 'system_admin', 'support_manager')
      ON DUPLICATE KEY UPDATE backend_role = VALUES(backend_role)
    `);

    // Insert default ticket statuses
    await connection.execute(`
      INSERT INTO ticket_statuses (tenant_id, label, color, description, display_order) VALUES
      (1, 'Open', '#3B82F6', 'Newly created ticket, awaiting triage', 1),
      (1, 'Assigned', '#3B82F6', 'Assigned to an owner', 2),
      (1, 'In Progress', '#3B82F6', 'Owner is actively working on it', 3),
      (1, 'Waiting for Employee', '#F97316', 'Awaiting employee response', 4),
      (1, 'Escalated', '#EF4444', 'Raised to department head', 5),
      (1, 'Resolved', '#059669', 'Resolution provided, pending confirmation', 6),
      (1, 'Closed', '#64748B', 'Ticket closed', 7),
      (1, 'Reopened', '#F97316', 'Re-opened after closure', 8)
      ON DUPLICATE KEY UPDATE color = VALUES(color), description = VALUES(description)
    `);

    // Insert default priority levels
    await connection.execute(`
      INSERT INTO priority_levels (tenant_id, label, color, sla_value, sla_unit) VALUES
      (1, 'Low', '#94A3B8', 5, 'days'),
      (1, 'Medium', '#F59E0B', 3, 'days'),
      (1, 'High', '#F97316', 1, 'days'),
      (1, 'Critical', '#EF4444', 4, 'hours')
      ON DUPLICATE KEY UPDATE color = VALUES(color), sla_value = VALUES(sla_value), sla_unit = VALUES(sla_unit)
    `);

    // Insert default departments
    await connection.execute(`
      INSERT INTO departments (tenant_id, name, description, status) VALUES
      (1, 'HR Operations', 'Handles day-to-day employee lifecycle, leave, attendance, and policy queries.', 'active'),
      (1, 'Payroll', 'Owns salary processing, payslips, reimbursements, and statutory deductions.', 'active'),
      (1, 'Learning & Development', 'Manages training programs, certifications, and learning platform access.', 'active'),
      (1, 'Compliance', 'Oversees policy adherence, ethics, data privacy, and regulatory matters.', 'active'),
      (1, 'Administration', 'Workplace services, facilities, identity cards, and asset allocation.', 'active'),
      (1, 'IT Support', 'Resolves access, accounts, hardware, and software issues.', 'active'),
      (1, 'Finance', 'Handles expense claims, budget queries, and financial approvals.', 'active')
      ON DUPLICATE KEY UPDATE description = VALUES(description)
    `);

    // Insert default subcategories for each department
    const deptSubcategories = {
      'HR Operations': ['Leave Requests', 'Attendance Issues', 'Employee Information Updates', 'Policy Queries', 'Onboarding Support'],
      'Payroll': ['Salary Discrepancies', 'Reimbursements', 'Payslip Requests', 'Tax Declarations', 'Bonus Queries'],
      'Learning & Development': ['Training Enrollment', 'Certification Requests', 'Platform Access', 'Course Recommendations'],
      'Compliance': ['Policy Violations', 'Ethics Concerns', 'Data Privacy', 'Audit Requests'],
      'Administration': ['Facility Requests', 'ID Card Issues', 'Asset Allocation', 'Seat Allocation'],
      'IT Support': ['Access Issues', 'Hardware Requests', 'Software Licenses'],
      'Finance': ['Expense Claims', 'Budget Queries', 'Financial Approvals']
    };

    for (const [deptName, subcats] of Object.entries(deptSubcategories)) {
      const [dept] = await connection.execute('SELECT id FROM departments WHERE name = ?', [deptName]);
      if (dept && dept.id) {
        for (let i = 0; i < subcats.length; i++) {
          await connection.execute(
            'INSERT IGNORE INTO department_subcategories (tenant_id, department_id, name, display_order) VALUES (?, ?, ?, ?)',
            [1, dept.id, subcats[i], i + 1]
          );
        }
      }
    }

    // Insert default permissions for each role
    const permissions = [
      'view_dashboard', 'view_tickets', 'create_ticket', 'edit_own_ticket', 'delete_own_ticket',
      'view_all_tickets', 'assign_tickets', 'escalate_tickets', 'resolve_tickets', 'close_tickets',
      'view_employees', 'manage_employees', 'view_departments', 'manage_departments',
      'view_policies', 'manage_policies', 'view_routing_rules', 'manage_routing_rules',
      'view_permissions', 'manage_permissions', 'view_audit_logs', 'manage_tenant_config'
    ];

    const roles = ['employee', 'hr_executive', 'department_head', 'system_admin'];
    for (const role of roles) {
      for (const perm of permissions) {
        await connection.execute(
          'INSERT IGNORE INTO role_permissions (tenant_id, role, permission_key, is_allowed) VALUES (?, ?, ?, 0)',
          [1, role, perm]
        );
      }
    }

    // Set sensible defaults for each role
    const roleDefaults = {
      employee: ['view_dashboard', 'view_tickets', 'create_ticket', 'edit_own_ticket'],
      hr_executive: ['view_dashboard', 'view_tickets', 'view_all_tickets', 'assign_tickets', 'resolve_tickets', 'close_tickets', 'view_employees', 'view_departments', 'view_policies'],
      department_head: ['view_dashboard', 'view_tickets', 'view_all_tickets', 'escalate_tickets', 'resolve_tickets', 'close_tickets', 'view_departments', 'view_policies', 'view_routing_rules'],
      system_admin: permissions // admin has all permissions
    };

    for (const [role, perms] of Object.entries(roleDefaults)) {
      for (const perm of perms) {
        await connection.execute(
          'UPDATE role_permissions SET is_allowed = 1 WHERE tenant_id = 1 AND role = ? AND permission_key = ?',
          [role, perm]
        );
      }
    }

    // Insert default tenant config
    await connection.execute(`
      INSERT INTO tenant_config (tenant_id, company_name, timezone, working_hours_start, working_hours_end, working_days) VALUES
      (1, 'Acme Corp', 'UTC', '09:00:00', '18:00:00', '1,2,3,4,5')
      ON DUPLICATE KEY UPDATE company_name = VALUES(company_name)
    `);

    await connection.commit();
    console.log('Migration completed successfully: add-admin-ui-tables');
  } catch (error) {
    await connection.rollback();
    console.error('Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

async function down() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DROP TABLE IF EXISTS audit_logs');
    await connection.execute('DROP TABLE IF EXISTS tenant_config');
    await connection.execute('DROP TABLE IF EXISTS role_permissions');
    await connection.execute('DROP TABLE IF EXISTS policies');
    await connection.execute('DROP TABLE IF EXISTS routing_rules');
    await connection.execute('DROP TABLE IF EXISTS priority_levels');
    await connection.execute('DROP TABLE IF EXISTS ticket_statuses');
    await connection.execute('DROP TABLE IF EXISTS department_subcategories');
    await connection.execute('DROP TABLE IF EXISTS departments');
    await connection.execute('DROP TABLE IF EXISTS role_mappings');
    await connection.commit();
    console.log('Rollback completed: add-admin-ui-tables');
  } catch (error) {
    await connection.rollback();
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  const command = process.argv[2];
  if (command === 'up') {
    up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
  } else if (command === 'down') {
    down().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
  } else {
    console.log('Usage: node add-admin-ui-tables.js [up|down]');
    process.exit(1);
  }
}

module.exports = { up, down };
