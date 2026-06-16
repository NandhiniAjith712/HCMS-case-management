# Dashboard Access Guide

This guide explains how to access the different role-based dashboards in your ITSM ticketing system.

## Available Dashboards

Your ITSM system now includes **4 different dashboards** based on user roles:

1. **User Dashboard** - For regular customers
2. **Admin Dashboard** - For support executives and administrators
3. **Manager Dashboard** - For support managers
4. **CEO Dashboard** - For executive-level overview

## How to Access Dashboards

### 1. Start the Application

First, make sure both backend and frontend are running:

```bash
# Terminal 1 - Start Backend
cd backend
npm start

# Terminal 2 - Start Frontend
cd frontend
npm start
```

### 2. Login with Role-Based Accounts

The system automatically routes you to the appropriate dashboard based on your role. Use these test accounts:

#### 👤 **Admin Dashboard**
- **Email:** `admin@company.com`
- **Password:** `admin123`
- **Access:** Full system administration

#### 👤 **Manager Dashboard**
- **Email:** `manager@company.com`
- **Password:** `manager123`
- **Access:** Team oversight, performance metrics, escalation management

#### 👤 **CEO Dashboard**
- **Email:** `ceo@company.com`
- **Password:** `ceo123`
- **Access:** Executive overview, strategic insights, department performance

#### 👤 **Support Executive Dashboard**
- **Email:** `executive1@company.com` or `executive2@company.com`
- **Password:** ` 
`
- **Access:** Ticket management and customer support

#### 👤 **User Dashboard**
- **Email:** `customer1@example.com` or `customer2@example.com`
- **Password:** `customer123`
- **Access:** View own tickets and submit new ones

### 3. Direct URL Access

You can also access dashboards directly via URL:

- **Admin/Executive:** `http://localhost:3000/admin`
- **Manager:** `http://localhost:3000/manager`
- **CEO:** `http://localhost:3000/ceo`
- **User Dashboard:** `http://localhost:3000/`

## Dashboard Features

### 🔧 **Admin Dashboard** (Support Executives)
- **Ticket Management:** View and manage all tickets
- **Status Updates:** Change ticket status (New → In Progress → Closed)
- **Reply System:** Send responses to customers
- **File Attachments:** View and download customer attachments
- **Email Integration:** Quick Gmail compose for customer communication

### 📊 **Manager Dashboard** (Support Managers)
- **Overview:** Key performance metrics and recent tickets
- **Team Performance:** Individual executive performance tracking
- **Escalated Tickets:** Manage urgent issues requiring attention
- **Reports:** Performance summaries and team analytics
- **Ticket Assignment:** Assign tickets to specific executives

### 🎯 **CEO Dashboard** (Executive Level)
- **Executive Overview:** High-level metrics and trends
- **Department Performance:** Compare department effectiveness
- **Trends & Analytics:** Monthly ticket volume and resolution trends
- **Strategic Insights:** Performance highlights and recommendations
- **ROI Analysis:** Business impact and cost metrics

### 👤 **User Dashboard** (Customers)
- **Ticket History:** View all submitted tickets
- **Status Tracking:** Monitor ticket progress
- **Submit New Tickets:** Create new support requests
- **Personal Stats:** View personal ticket statistics

## Role Permissions

| Feature | User | Executive | Manager | CEO | Admin |
|---------|------|-----------|---------|-----|-------|
| Submit Tickets | ✅ | ❌ | ❌ | ❌ | ❌ |
| View Own Tickets | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage All Tickets | ❌ | ✅ | ✅ | ✅ | ✅ |
| Team Performance | ❌ | ❌ | ✅ | ✅ | ❌ |
| Department Overview | ❌ | ❌ | ❌ | ✅ | ❌ |
| Strategic Analytics | ❌ | ❌ | ❌ | ✅ | ❌ |
| System Administration | ❌ | ❌ | ❌ | ❌ | ✅ |

## Quick Start Steps

1. **Open your browser** and go to `http://localhost:3000`
2. **Login** with one of the test accounts above
3. **Explore your dashboard** - the system automatically shows the appropriate interface
4. **Test different roles** by logging out and logging in with different accounts

## Troubleshooting

### If you can't access a dashboard:
1. Make sure both backend (`localhost:5000`) and frontend (`localhost:3000`) are running
2. Check that you're using the correct login credentials
3. Clear browser cache if needed
4. Check browser console for any error messages

### If data doesn't appear:
1. Ensure the database is properly seeded with test data
2. Check that the backend API is responding at `http://localhost:5000/health`
3. Verify that tickets exist in the database

## Database Seeding

If you need to reset the test data, run:

```bash
cd backend
node seed-users.js
```

This will create all the test accounts mentioned above.

## Next Steps

- **Create real user accounts** by modifying the seed data
- **Customize dashboard features** based on your organization's needs
- **Add more roles** if needed for your specific use case
- **Integrate with real authentication** for production use

---

**Need Help?** Check the main documentation or contact your system administrator. 