# Knowledge Base Module - Archive Documentation

## Archive Date
June 15, 2026

## Reason for Archiving
The Knowledge Base module is being archived as part of the ITSM to HRMS (Human Resource Management System) transformation. The Knowledge Base system is not required for HRMS and will be replaced with HR-specific knowledge management if needed in the future.

## Original Locations

### Backend Files
- `backend/routes/knowledge.js` - Knowledge Base route endpoints

### Frontend Files
- `frontend/src/pages/KnowledgeBasePage.js` - Knowledge Base page component

## Archived Locations

### Backend Files
- `archive/backend/routes/knowledge.js`

### Frontend Files
- `archive/frontend/src/pages/KnowledgeBasePage.js`

## Files Moved

Total files moved: 2

### Backend (1 file)
1. routes/knowledge.js

### Frontend (1 file)
1. pages/KnowledgeBasePage.js

## Dependencies

### Backend Dependencies
- **routes/knowledge.js**:
  - Express.js
  - mysql2 (database pool)
  - middleware/auth.js (authentication)
  - middleware/tenant.js (multi-tenancy)
  - Elasticsearch (external knowledge base search)
  - Database: No specific tables (uses external Elasticsearch)

### Frontend Dependencies
- **pages/KnowledgeBasePage.js**:
  - React
  - utils/api.js (API calls)
  - Backend endpoint: /api/knowledge

## Database Table

### No Database Tables
- **Purpose**: Knowledge Base uses external Elasticsearch, not database tables
- **Status**: No database tables to drop
- **Future Action**: None

## Import/Reference Updates Required

### Backend Files to Update
1. **backend/server.js**:
   - Remove: `const knowledgeRouter = require('./routes/knowledge');`
   - Remove: `app.use('/api/knowledge', knowledgeRouter.router);`

### Frontend Files to Update
1. **frontend/src/App.js**:
   - Remove: `import KnowledgeBasePage from './pages/KnowledgeBasePage';`
   - Remove: `/manager/knowledge-base` route
   - Remove: `/agent/knowledge-base` route

2. **frontend/src/components/dashboards/ManagerDashboard.js**:
   - Remove: Knowledge Base icon case in MdrSidebarIcon
   - Remove: Knowledge Base navigation button

3. **frontend/src/components/dashboards/AgentDashboard.js**:
   - Remove: Knowledge Base icon case in AdrSidebarIcon
   - Remove: Knowledge Base navigation button

## References Found

### Backend References
- `backend/server.js` - Route mounting and import

### Frontend References
- `frontend/src/App.js` - Route definitions and import
- `frontend/src/components/dashboards/ManagerDashboard.js` - Navigation button and icon
- `frontend/src/components/dashboards/AgentDashboard.js` - Navigation button and icon

## Impact Assessment

### High Impact
- None (Knowledge Base is self-contained)

### Medium Impact
- Dashboard navigation links (need to remove Knowledge Base links)

### Low Impact
- Route configuration (need to remove /api/knowledge)
- Component imports (need to remove KnowledgeBasePage import)

## Restoration Plan

If Knowledge Base functionality needs to be restored:
1. Move files back from archive to original locations
2. Restore route mounting in backend/server.js
3. Restore component imports in frontend/App.js
4. Restore routes in frontend/App.js
5. Restore navigation buttons in dashboards
6. Restore icon cases in dashboards

## Notes
- No controllers were present (backend uses route-handler pattern)
- No models were present (backend uses external Elasticsearch)
- No utilities were specific to Knowledge Base module
- Knowledge Base used external Elasticsearch for search
- No database tables were used (external search engine)
- Knowledge Base was independent with minimal dependencies
