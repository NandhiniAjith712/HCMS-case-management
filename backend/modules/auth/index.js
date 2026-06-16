/**
 * HCMS Authentication module.
 *
 * Public surface for use across the app:
 *   const auth = require('./modules/auth');
 *   app.use('/api/auth', auth.routes);
 *   router.get('/x', auth.authenticate, auth.authorizeRoles(auth.ROLES.ADMIN), handler);
 */
const routes = require('./routes/auth.routes');
const authService = require('./services/auth.service');
const { authenticate, authorizeRoles } = require('./middleware/auth.middleware');
const { ROLES, ALL_ROLES, isValidRole } = require('./constants/roles');

module.exports = {
  routes,
  service: authService,
  authenticate,
  authorizeRoles,
  ROLES,
  ALL_ROLES,
  isValidRole
};
