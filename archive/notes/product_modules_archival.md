# Product Modules Archival - Documentation

## Archive Date
June 15, 2026

## Reason for Archiving
Product-related modules are being archived as part of the ITSM to HRMS (Human Resource Management System) transformation. The product/module concept is not applicable to HRMS and will be replaced with HR services and departments.

## Modules Archived

### 1. Legacy Replies (Communication)
- **Module**: routes/communication/replies.js
- **Reason**: Functionality merged into ticket_messages; legacy component
- **Backend Files**: routes/communication/replies.js
- **Frontend Files**: None
- **Database Tables**: ticket_messages (not dropped, still used by new system)

### 2. Product SPOC
- **Module**: routes/productSpoc.js
- **Reason**: Product SPOC concept not applicable to HRMS
- **Backend Files**: routes/productSpoc.js
- **Frontend Files**: components/dashboards/ProductSpocDashboard.js
- **Database Tables**: product_spoc_mapping

### 3. Tenant SPOC
- **Module**: routes/tenantSpoc.js
- **Reason**: Tenant SPOC can be replaced with standard user roles
- **Backend Files**: routes/tenantSpoc.js
- **Frontend Files**: None
- **Database Tables**: users (not dropped, still used)

### 4. Product Dashboard
- **Module**: components/dashboards/ProductDashboard.js
- **Reason**: Product dashboard not applicable to HRMS
- **Backend Files**: None
- **Frontend Files**: components/dashboards/ProductDashboard.js
- **Database Tables**: None

### 5. Product SPOC Dashboard
- **Module**: components/dashboards/ProductSpocDashboard.js
- **Reason**: Product SPOC dashboard not applicable to HRMS
- **Backend Files**: None
- **Frontend Files**: components/dashboards/ProductSpocDashboard.js
- **Database Tables**: None

## Original Locations

### Backend Files
- `backend/routes/communication/replies.js`
- `backend/routes/productSpoc.js`
- `backend/routes/tenantSpoc.js`

### Frontend Files
- `frontend/src/components/dashboards/ProductDashboard.js`
- `frontend/src/components/dashboards/ProductSpocDashboard.js`

## Archived Locations

### Backend Files
- `archive/backend/routes/communication/replies.js`
- `archive/backend/routes/productSpoc.js`
- `archive/backend/routes/tenantSpoc.js`

### Frontend Files
- `archive/frontend/src/components/dashboards/ProductDashboard.js`
- `archive/frontend/src/components/dashboards/ProductSpocDashboard.js`

## Files Moved

Total files moved: 5

### Backend (3 files)
1. routes/communication/replies.js
2. routes/productSpoc.js
3. routes/tenantSpoc.js

### Frontend (2 files)
1. components/dashboards/ProductDashboard.js
2. components/dashboards/ProductSpocDashboard.js

## Dependencies

### Backend Dependencies
- **routes/communication/replies.js**:
  - Express.js
  - mysql2 (database pool)
  - middleware/auth.js (authentication)
  - middleware/tenant.js (multi-tenancy)
  - Database table: ticket_messages

- **routes/productSpoc.js**:
  - Express.js
  - mysql2 (database pool)
  - middleware/auth.js (authentication)
  - middleware/tenant.js (multi-tenancy)
  - Database tables: product_spoc_mapping, products

- **routes/tenantSpoc.js**:
  - Express.js
  - mysql2 (database pool)
  - middleware/auth.js (authentication)
  - middleware/tenant.js (multi-tenancy)
  - Database table: users

### Frontend Dependencies
- **components/dashboards/ProductDashboard.js**:
  - React
  - utils/api.js (API calls)
  - Backend endpoints: /api/products, /api/product-spoc

- **components/dashboards/ProductSpocDashboard.js**:
  - React
  - utils/api.js (API calls)
  - Backend endpoints: /api/product-spoc

## Database Tables

### Tables Related to Archived Modules
- **product_spoc_mapping**: Product SPOC mapping table
- **products**: Products table
- **modules**: Modules table
- **ticket_messages**: Still used by new system (not dropped)

### Tables Status
- **ticket_messages**: Keep (used by new unified messaging system)
- **product_spoc_mapping**: Archive (drop after verification)
- **products**: Archive (drop after verification)
- **modules**: Archive (drop after verification)

## Import/Reference Updates Required

### Backend Files to Update
1. **backend/server.js**:
   - Remove: `const repliesRouter = require('./routes/communication/replies');`
   - Remove: `app.use('/api/replies', repliesRouter);`
   - Remove: `const tenantSpocRouter = require('./routes/tenantSpoc');`
   - Remove: `app.use('/api/tenant-spoc', tenantSpocRouter);`
   - Remove: `app.use('/api/product-spoc', require('./routes/productSpoc'));`

### Frontend Files to Update
1. **frontend/src/App.js**:
   - Remove: `import ProductDashboard from './components/dashboards/ProductDashboard';`
   - Remove: `/products` route
   - Remove: `/manager/products` route
   - Remove: `/business-products` route

2. **frontend/src/components/dashboards/UserDashboard.js**:
   - Remove: `import ProductSpocDashboard from './ProductSpocDashboard';`
   - Remove: product_spoc role check

## References Found

### Backend References
- `backend/server.js` - Route mounting and imports

### Frontend References
- `frontend/src/App.js` - Route definitions and import
- `frontend/src/components/dashboards/UserDashboard.js` - Import and role check

## Impact Assessment

### High Impact
- None (product modules are self-contained)

### Medium Impact
- Dashboard navigation links (removed)
- Product SPOC role (role check commented out)

### Low Impact
- Route configuration (routes removed)
- Component imports (imports commented out)

## Restoration Plan

If product functionality needs to be restored:
1. Move files back from archive to original locations
2. Restore route mounting in backend/server.js
3. Restore component imports in frontend/App.js
4. Restore routes in frontend/App.js
5. Restore role check in UserDashboard.js

## Notes
- No controllers were present (backend uses route-handler pattern)
- No models were present (backend uses direct SQL queries)
- No utilities were specific to product modules
- Product modules were independent with minimal dependencies
- ticket_messages table still used by new unified messaging system
- Product SPOC role check commented out in UserDashboard.js
