# 📋 SLA System Implementation Guide

## 🎯 **Overview**

This document explains the complete SLA (Service Level Agreement) system implementation for the ticketing system. The system allows business teams to manually configure SLA rules for different products, modules, and issue types.

## 🗄️ **Database Schema**

### **1. Products Table**
```sql
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
```

**Purpose**: Master list of all products/services that can have SLA rules

### **2. Modules Table**
```sql
CREATE TABLE modules (
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
);
```

**Purpose**: Sub-components within products that can have specific SLA rules

### **3. SLA Configurations Table**
```sql
CREATE TABLE sla_configurations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  module_id INT NOT NULL,
  issue_name VARCHAR(150) NOT NULL,
  issue_description TEXT,
  priority_level ENUM('P0', 'P1', 'P2', 'P3') DEFAULT 'P2',
  response_time_minutes INT NOT NULL COMMENT 'First response time in minutes',
  resolution_time_minutes INT NOT NULL COMMENT 'Complete resolution time in minutes',
  business_hours_only BOOLEAN DEFAULT TRUE COMMENT 'Whether SLA applies only during business hours',
  escalation_time_minutes INT COMMENT 'Time before escalation in minutes',
  escalation_level ENUM('manager', 'technical_manager', 'ceo') DEFAULT 'manager',
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT,
  updated_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_sla_config (product_id, module_id, issue_name, priority_level)
);
```

**Purpose**: Stores SLA rules for specific product-module-issue-priority combinations

### **4. SLA Timers Table**
```sql
CREATE TABLE sla_timers (
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
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sla_configuration_id) REFERENCES sla_configurations(id) ON DELETE CASCADE
);
```

**Purpose**: Tracks SLA compliance for individual tickets

### **5. Escalations Table**
```sql
CREATE TABLE escalations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sla_timer_id INT NOT NULL,
  from_level ENUM('agent', 'manager', 'technical_manager', 'ceo') NOT NULL,
  to_level ENUM('manager', 'technical_manager', 'ceo') NOT NULL,
  reason TEXT,
  escalated_by INT NOT NULL,
  escalated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending', 'in_progress', 'resolved') DEFAULT 'pending',
  resolved_at DATETIME NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sla_timer_id) REFERENCES sla_timers(id) ON DELETE CASCADE,
  FOREIGN KEY (escalated_by) REFERENCES users(id) ON DELETE CASCADE
);
```

**Purpose**: Tracks ticket escalations when SLA deadlines are approaching

## 🔌 **API Endpoints**

### **Products Management**
- `GET /api/sla/products` - Get all products
- `POST /api/sla/products` - Create new product
- `PUT /api/sla/products/:id` - Update product

### **Modules Management**
- `GET /api/sla/products/:productId/modules` - Get modules for a product
- `POST /api/sla/modules` - Create new module
- `PUT /api/sla/modules/:id` - Update module

### **SLA Configurations**
- `GET /api/sla/configurations` - Get SLA configurations (with filters)
- `POST /api/sla/configurations` - Create new SLA configuration
- `PUT /api/sla/configurations/:id` - Update SLA configuration
- `GET /api/sla/configurations/ticket` - Get SLA for ticket creation

## 🎨 **Frontend Components**

### **SLAManagement Component**
- **Location**: `frontend/src/components/SLAManagement.js`
- **CSS**: `frontend/src/components/SLAManagement.css`
- **Features**:
  - Product management (add/edit products)
  - Module management (add/edit modules per product)
  - SLA configuration management (add/edit SLA rules)
  - Visual SLA card display with priority colors
  - Modal forms for data entry
  - Responsive design

## 📊 **Sample Data Structure**

### **Products Example**
```javascript
[
  {
    id: 1,
    name: "VOC (Voice of Customer)",
    description: "Customer feedback and survey management system",
    status: "active"
  },
  {
    id: 2,
    name: "GRC (Governance, Risk, Compliance)",
    description: "Governance, risk management, and compliance platform",
    status: "active"
  }
]
```

### **Modules Example**
```javascript
[
  {
    id: 1,
    product_id: 1,
    name: "Survey Creation",
    description: "Create and manage customer surveys",
    status: "active"
  },
  {
    id: 2,
    product_id: 1,
    name: "Response Collection",
    description: "Collect and store survey responses",
    status: "active"
  }
]
```

### **SLA Configurations Example**
```javascript
[
  {
    id: 1,
    product_id: 1,
    module_id: 1,
    issue_name: "General Inquiry",
    issue_description: "General questions about the module",
    priority_level: "P3",
    response_time_minutes: 480, // 8 hours
    resolution_time_minutes: 1440, // 24 hours
    business_hours_only: true,
    escalation_time_minutes: 240, // 4 hours
    escalation_level: "manager"
  },
  {
    id: 2,
    product_id: 1,
    module_id: 1,
    issue_name: "Critical Issue",
    issue_description: "Critical system failure or security issue",
    priority_level: "P0",
    response_time_minutes: 30, // 30 minutes
    resolution_time_minutes: 240, // 4 hours
    business_hours_only: false,
    escalation_time_minutes: 15, // 15 minutes
    escalation_level: "ceo"
  }
]
```

## 🚀 **Setup Instructions**

### **1. Database Setup**
```bash
# Run the database initialization
cd backend
node server.js
```

### **2. Seed Sample Data**
```bash
# Run the SLA data seeder
cd backend
node seed-sla-data.js
```

### **3. Frontend Integration**
Add the SLA management component to your dashboard:

```javascript
import SLAManagement from './components/SLAManagement';

// In your dashboard component
<SLAManagement />
```

## 🎯 **Priority Levels**

| **Level** | **Description** | **Response Time** | **Resolution Time** |
|-----------|-----------------|-------------------|-------------------|
| **P0** | Critical | 15-30 minutes | 1-4 hours |
| **P1** | High | 1-2 hours | 8-24 hours |
| **P2** | Medium | 4-8 hours | 24-48 hours |
| **P3** | Low | 8-24 hours | 48-72 hours |

## ⏰ **Time Calculations**

### **Business Hours vs 24/7**
- **Business Hours Only**: SLA timers pause outside business hours (e.g., 9 AM - 6 PM)
- **24/7**: SLA timers run continuously

### **Escalation Levels**
1. **Manager**: First escalation level
2. **Technical Manager**: Technical issues escalation
3. **CEO**: Critical issues escalation

## 🔧 **Integration with Ticket System**

### **Ticket Creation Flow**
1. User selects product and module
2. System fetches applicable SLA configurations
3. User selects issue type and priority
4. System displays SLA timeline to user
5. Ticket is created with SLA timer started

### **SLA Timer Management**
- **Response Timer**: Starts when ticket is created
- **Resolution Timer**: Starts when first response is sent
- **Escalation Timer**: Starts when approaching SLA deadline

## 📱 **Business Team Usage**

### **Adding New Products**
1. Navigate to SLA Management
2. Click "Add Product"
3. Enter product name and description
4. Set status to active

### **Adding Modules**
1. Select a product
2. Click "Add Module"
3. Enter module name and description
4. Set status to active

### **Configuring SLA Rules**
1. Select product and module
2. Click "Add SLA Configuration"
3. Configure:
   - Issue name and description
   - Priority level
   - Response and resolution times
   - Business hours setting
   - Escalation settings

## 🔒 **Security & Permissions**

### **Access Control**
- **Admin/Manager Roles**: Full access to SLA management
- **Support Executive**: View-only access to SLA configurations
- **Regular Users**: No access to SLA management

### **Data Validation**
- Unique constraints prevent duplicate SLA configurations
- Required field validation
- Time format validation
- Priority level validation

## 📈 **Monitoring & Reporting**

### **SLA Compliance Metrics**
- Response time compliance rate
- Resolution time compliance rate
- Escalation frequency
- SLA breach analysis

### **Dashboard Integration**
- SLA compliance charts
- Priority distribution
- Product-wise SLA performance
- Escalation trends

## 🛠️ **Troubleshooting**

### **Common Issues**
1. **SLA not found**: Check if product/module combination exists
2. **Timer not starting**: Verify SLA configuration is active
3. **Escalation not working**: Check escalation time settings
4. **Business hours issue**: Verify business hours configuration

### **Debug Commands**
```bash
# Check SLA configurations
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/sla/configurations

# Check specific SLA for ticket
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/sla/configurations/ticket?product_id=1&module_id=1&priority_level=P2"
```

## 📝 **Future Enhancements**

### **Planned Features**
1. **SLA Templates**: Pre-defined SLA templates for common scenarios
2. **Automated Escalation**: Email/SMS notifications for escalations
3. **SLA Analytics**: Advanced reporting and analytics
4. **Multi-timezone Support**: Global business hours handling
5. **SLA History**: Track SLA changes over time

### **Integration Points**
1. **WhatsApp Integration**: SLA notifications via WhatsApp
2. **Email Integration**: Automated SLA breach notifications
3. **Dashboard Integration**: Real-time SLA status display
4. **Mobile App**: SLA management on mobile devices

---

This SLA system provides a comprehensive, flexible solution for managing service level agreements across multiple products and modules, with full business team control over SLA configurations. 