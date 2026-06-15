# Customer Access Workflow – Test Steps

## Important: Support URL is the Only Entry Point
Customers **always** access via the support URL: `http://localhost:3000/{product}?user_email={email}`

- Going to `localhost:3000/` or `/login` with valid customer session → auto-redirects to support URL
- After login/create-password on customer-access → always redirects to support URL
- Bookmark the support URL for repeat access

## Prerequisites
- Backend and frontend running (e.g. `npm run dev` in both)
- A product exists in DB (e.g. `grc` or `voiceloop`)
- Use `http://localhost:3000` for frontend, adjust if different

---

## Scenario 1: NEW user (first time) – support URL from email

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:3000/grc?user_email=newuser123@test.com` (use a NEW email never used before) | User is created, logged in, sees UserDashboard |
| 2 | Verify | No password or customer-access page; dashboard loads directly |

**Pass:** New user gets in without any password step.

---

## Scenario 2: RETURNING user, NO password – session ended

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create a returning user: open `http://localhost:3000/grc?user_email=nopwd@test.com` (new email) | User created, dashboard shown |
| 2 | Clear storage: DevTools → Application → Local Storage → Clear all (or use test page) | Session cleared |
| 3 | Open `http://localhost:3000/grc?user_email=nopwd@test.com` again | Redirected to **Customer Access** with email pre-filled |
| 4 | Verify | **Create password** form is shown (email read-only) |
| 5 | Set password (min 6 chars), confirm, click "Create Password & Sign In" | Logged in, redirected to dashboard |

**Pass:** Returning user without password sees Create password form and can set a password.

---

## Scenario 3: RETURNING user, HAS password – session ended

| Step | Action | Expected |
|------|--------|----------|
| 1 | Use user from Scenario 2 (`nopwd@test.com`) who now has a password | - |
| 2 | Clear storage (or use incognito) | Session cleared |
| 3 | Open `http://localhost:3000/grc?user_email=nopwd@test.com` | Redirected to **Customer Access** with email pre-filled |
| 4 | Verify | **Login** form is shown (email read-only) |
| 5 | Enter password, click "Sign In" | Logged in, redirected to dashboard |

**Pass:** Returning user with password sees Login form and can sign in.

---

## Scenario 4: RETURNING user – valid session (no redirect)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Be logged in as customer (e.g. from Scenario 2 or 3) | UserDashboard visible |
| 2 | Open `http://localhost:3000/grc?user_email=nopwd@test.com` again (same email) | Dashboard loads immediately, no redirect |

**Pass:** Valid session is reused; no customer-access redirect.

---

## Scenario 5: Direct customer-access – no email in URL

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `http://localhost:3000/customer-access` | Email form shown |
| 2 | Enter existing customer email, click Continue | Shows Create password or Login based on whether they have a password |
| 3 | Enter email that doesn’t exist | "No account found" message |

**Pass:** Customer-access works standalone with manual email entry.

---

## Scenario 6: Direct /userdashboard – session ended

| Step | Action | Expected |
|------|--------|----------|
| 1 | Clear storage | - |
| 2 | Open `http://localhost:3000/userdashboard` | Redirected to customer-access (returnTo=/userdashboard) |
| 3 | Enter email, complete create-password or login | Redirected back to userdashboard |

**Pass:** Direct dashboard access without session leads to customer-access.

---

## Quick reference

| User type | Session | Has password? | Result |
|-----------|---------|---------------|--------|
| New | - | - | Auto-login, dashboard |
| Returning | Expired | No | Redirect → Create password → Login → Dashboard |
| Returning | Expired | Yes | Redirect → Login → Dashboard |
| Returning | Valid | Any | Reuse session, dashboard |
