# Staff Password Setup Flow

This document describes the staff login and password setup mechanism for agents, managers, and CEOs, aligned with security requirements.

## Overview

- **No auto-generated credentials**: Admins create staff with name, email, and role only. No password is generated or shown.
- **Pending state**: New accounts are created with `is_active = false` until the staff member sets their password.
- **Email-based setup**: System sends a secure setup link to the staff member's email.
- **Staff sets own password**: Staff use the setup link to create their password. Password is hashed (bcrypt) before storing.
- **Login**: Staff log in with email + password at `/login`. Role-based redirect applies.
- **Forgot password**: Staff can request a password reset link via email.

## Flow

### 1. Admin Creates Staff (Business Dashboard)

- Go to Business Dashboard → Agents tab → Add Staff Member
- Enter: **Name**, **Email**, **Role** (Department and Manager are optional)
- No password is generated or shown
- System creates the account in a pending password setup state (`is_active = false`)

### 2. System Sends Setup Email

- A secure, time-limited (7 days) setup link is generated
- An email is sent to the staff member's registered email address
- The email contains a link to the Set Password page
- If email fails, the setup link is shown in a modal for the admin to share manually

### 3. Staff Sets Password

- Staff opens the setup link: `/staff/set-password?token=...`
- Creates a password (min 6 characters), validated per system rules
- Password is hashed before storing; plain text is never stored
- After success: `password_set` (implied by `password_hash`), `is_active = true`, setup token is cleared

### 4. Staff Logs In

- Staff goes to `/login` and enters **email** and **password**
- After login, redirect based on role:
  - `support_agent` → Agent Dashboard
  - `support_manager` → Manager Dashboard
  - `ceo` / `admin` → Admin Dashboard

### 5. Forgot Password

- Staff clicks **Forgot password?** on the login page
- Enters email; system sends a password reset link (1 hour expiry)
- Staff opens `/staff/reset-password?token=...` and creates a new password
- New password is hashed and stored; reset token is cleared

### 6. Resend Setup Link (Admin Fallback)

- In the Agents table, staff with "Pending setup" status have a **Resend Setup Link** button
- Admin can resend; system sends a new setup email (and optionally copies link to clipboard)

## Security Rules

- No random passwords are generated
- Passwords are never shown in alerts, API responses, or UI
- Only hashed passwords are stored
- Setup and reset links use secure time-limited tokens
- Invalid/expired links are handled with clear error messages

## Environment Variables

- `FRONTEND_URL` or `PUBLIC_BASE_URL`: Base URL for setup/reset links (default: `http://localhost:3000`)
- SMTP config (`SMTP_EMAIL`, `SMTP_PASSWORD`, etc.): For sending setup and reset emails

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/register` | POST | Create staff (sends setup email) |
| `/api/agents/:id/resend-setup-link` | POST | Resend setup link (sends email) |
| `/api/auth/global-login` | POST | Login with `email` and `password` |
| `/api/auth/staff/set-password` | POST | Set initial password (body: `token`, `password`) |
| `/api/auth/forgot-password` | POST | Request reset (body: `email`) |
| `/api/auth/reset-password` | POST | Reset with token (body: `token`, `password`) |
