# FAQ Module - Archive Documentation

## Archive Date
June 15, 2026

## Reason for Archiving
The FAQ (Frequently Asked Questions) module is being archived as part of the ITSM to HRMS (Human Resource Management System) transformation. The FAQ system is not required for HRMS and will be replaced with HR-specific knowledge management if needed in the future.

## Original Locations

### Backend Files
- `backend/routes/faqs.js` - FAQ route endpoints
- `backend/services/faqSemanticSearchService.js` - FAQ semantic search service
- `backend/migrations/add-faqs-table.js` - FAQ table migration script

### Frontend Files
- `frontend/src/components/help/HelpFAQPage.js` - FAQ help page component
- `frontend/src/components/help/HelpFAQPage.css` - FAQ help page styles
- `frontend/src/components/admin/FAQAdminPage.js` - FAQ admin page component
- `frontend/src/components/admin/FAQAdminPage.css` - FAQ admin page styles

## Archived Locations

### Backend Files
- `archive/backend/routes/faqs.js`
- `archive/backend/services/faqSemanticSearchService.js`
- `archive/backend/migrations/add-faqs-table.js`

### Frontend Files
- `archive/frontend/src/components/help/HelpFAQPage.js`
- `archive/frontend/src/components/help/HelpFAQPage.css`
- `archive/frontend/src/components/admin/FAQAdminPage.js`
- `archive/frontend/src/components/admin/FAQAdminPage.css`

## Files Moved

Total files moved: 7

### Backend (3 files)
1. routes/faqs.js
2. services/faqSemanticSearchService.js
3. migrations/add-faqs-table.js

### Frontend (4 files)
1. components/help/HelpFAQPage.js
2. components/help/HelpFAQPage.css
3. components/admin/FAQAdminPage.js
4. components/admin/FAQAdminPage.css

## Dependencies

### Backend Dependencies
- **routes/faqs.js**:
  - Express.js
  - mysql2 (database pool)
  - middleware/auth.js (authentication)
  - middleware/tenant.js (multi-tenancy)
  - services/faqSemanticSearchService.js (semantic search)
  - Database table: faqs

- **services/faqSemanticSearchService.js**:
  - Elasticsearch (semantic search)
  - Database table: faqs

- **migrations/add-faqs-table.js**:
  - mysql2
  - Database table: faqs

### Frontend Dependencies
- **components/help/HelpFAQPage.js**:
  - React
  - utils/api.js (API calls)
  - Backend endpoint: /api/faqs

- **components/admin/FAQAdminPage.js**:
  - React
  - utils/api.js (API calls)
  - Backend endpoint: /api/faqs

## Database Table

### faqs Table
- **Purpose**: Store FAQ questions and answers
- **Columns**: id, tenant_id, product, category, question, answer, tags, faq_embedding, created_at, updated_at
- **Status**: Table still exists in database (not dropped)
- **Future Action**: Table can be dropped after confirming no other dependencies

## Import/Reference Updates Required

### Backend Files to Update
1. **backend/server.js**:
   - Remove: `app.use('/api/faqs', require('./routes/faqs'));`

2. **backend/database.js**:
   - Remove faqs table creation (lines 1035-1054)
   - Remove faqs column additions (lines 1057-1067)

### Frontend Files to Update
1. **frontend/src/App.js**:
   - Remove FAQ route references

2. **frontend/src/utils/api.js**:
   - Remove FAQ-related API functions (if any)

3. **frontend/src/components/dashboards/CEODashboard.js**:
   - Remove FAQ-related imports and references

4. **frontend/src/components/dashboards/UserDashboard.js**:
   - Remove FAQ-related imports and references

## References Found

### Backend References
- `backend/server.js` - Route mounting
- `backend/database.js` - Table creation
- `backend/routes/tickets.js` - Possible cross-references (verify)

### Frontend References
- `frontend/src/App.js` - Route definitions
- `frontend/src/utils/api.js` - API calls
- `frontend/src/components/dashboards/CEODashboard.js` - Dashboard links
- `frontend/src/components/dashboards/UserDashboard.js` - Dashboard links
- `frontend/src/components/tickets/UserForm.js` - Possible references (verify)

## Impact Assessment

### High Impact
- None (FAQ module is self-contained)

### Medium Impact
- Dashboard navigation links (need to remove FAQ links)
- Database table (faqs table still exists)

### Low Impact
- Route configuration (need to remove /api/faqs)
- Component imports (need to remove FAQ component imports)

## Restoration Plan

If FAQ functionality needs to be restored:
1. Move files back from archive to original locations
2. Restore route mounting in backend/server.js
3. Restore table creation in backend/database.js
4. Restore component imports in frontend
5. Restore route definitions in frontend/App.js

## Notes
- No controllers were present (backend uses route-handler pattern)
- No models were present (backend uses direct SQL queries)
- No utilities were specific to FAQ module
- FAQ module was independent with minimal dependencies
- Semantic search used Elasticsearch (external dependency)
- FAQ table has vector embeddings for semantic search (faq_embedding column)
