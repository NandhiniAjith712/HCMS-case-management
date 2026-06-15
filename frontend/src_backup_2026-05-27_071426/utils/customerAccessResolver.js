export const CUSTOMER_ACCESS_STATES = {
  NEW_USER_CREATE_PASSWORD: 'NEW_USER_CREATE_PASSWORD',
  PENDING_EMAIL_VERIFICATION: 'PENDING_EMAIL_VERIFICATION',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  AUTHENTICATED_DASHBOARD_ACCESS: 'AUTHENTICATED_DASHBOARD_ACCESS',
  ACCESS_DENIED: 'ACCESS_DENIED'
};

const normalize = (v) => String(v || '').trim().toLowerCase();
const canonicalizeEmail = (email) => {
  const raw = normalize(email);
  if (!raw || !raw.includes('@')) return raw;
  const [local, domain] = raw.split('@');
  if (!local || !domain) return raw;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const plusIndex = local.indexOf('+');
    const noPlus = plusIndex >= 0 ? local.slice(0, plusIndex) : local;
    const noDots = noPlus.replace(/\./g, '');
    return `${noDots}@gmail.com`;
  }
  return `${local}@${domain}`;
};

export const clearCustomerSessionStorage = () => {
  [
    'customerData',
    'customerToken',
    'customer_id',
    'customer_name',
    'customer_email',
    'customer_role',
    'autoLoginContext',
    'customerTicketReturnTo'
  ].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
};

export const getSessionDecision = (expectedEmail, isCustomerSessionValid) => {
  const want = canonicalizeEmail(expectedEmail);
  if (!isCustomerSessionValid(want || undefined)) {
    return { valid: false, reason: 'missing_or_expired' };
  }
  try {
    const user = JSON.parse(localStorage.getItem('customerData') || '{}');
    const got = canonicalizeEmail(user?.email);
    if (want && got && want !== got) {
      clearCustomerSessionStorage();
      return { valid: false, reason: 'email_mismatch' };
    }
    if (!got) {
      clearCustomerSessionStorage();
      return { valid: false, reason: 'invalid_user_data' };
    }
    return { valid: true, user };
  } catch {
    clearCustomerSessionStorage();
    return { valid: false, reason: 'parse_error' };
  }
};

export const resolveAccessState = ({ backendState, exists, hasPassword, emailVerified, accountStatus }) => {
  const known = Object.values(CUSTOMER_ACCESS_STATES);
  if (known.includes(backendState)) return backendState;
  if (!exists) return CUSTOMER_ACCESS_STATES.NEW_USER_CREATE_PASSWORD;
  const verified = !!emailVerified;
  const status = normalize(accountStatus);
  if (!verified || status === 'pending_verification') return CUSTOMER_ACCESS_STATES.PENDING_EMAIL_VERIFICATION;
  if (!hasPassword) return CUSTOMER_ACCESS_STATES.NEW_USER_CREATE_PASSWORD;
  return CUSTOMER_ACCESS_STATES.LOGIN_REQUIRED;
};

export const stateToCustomerStep = (state) => {
  if (state === CUSTOMER_ACCESS_STATES.PENDING_EMAIL_VERIFICATION) return 'verify-pending';
  if (state === CUSTOMER_ACCESS_STATES.NEW_USER_CREATE_PASSWORD) return 'create-password';
  if (state === CUSTOMER_ACCESS_STATES.LOGIN_REQUIRED) return 'login';
  return 'email';
};
