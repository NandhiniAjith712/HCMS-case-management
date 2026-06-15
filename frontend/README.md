# Tick Frontend

A modern, responsive React frontend for the Tick ticketing system. Users can submit support queries, and agents manage tickets via a professional dashboard.

## Features
- **User Ticket Form:** Elegant, accessible form for submitting support queries (name, email, mobile, description, PDF upload).
- **Agent Dashboard:**
  - Side panel navigation (New, In Progress, Closed)
  - Kanban-style ticket management
  - Ticket state transitions (Open, Resolve)
  - Mail reply section for agent responses
  - Modern glassmorphism UI, fully responsive
- **No user authentication required** for ticket submission.

## Folder Structure
```
frontend/
  ├── public/           # Static assets and index.html
  ├── src/
  │   ├── components/   # React components (UserForm, AgentDashboard, etc.)
  │   ├── App.js        # Main app entry
  │   └── ...
  ├── package.json      # Project metadata and scripts
  └── README.md         # This file
```

## Getting Started
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start the development server:**
   ```bash
   npm start
   ```
   The app runs at [http://localhost:3000](http://localhost:3000).

## Available Scripts
- `npm start` — Run the app in development mode
- `npm run build` — Build for production
- `npm test` — Run tests

## Customization
- **UI:** All styles are in `src/components/*.css` (glassmorphism, gradients, responsive design)
- **Ticket logic:** See `AgentDashboard.js` for ticket state transitions and reply logic
- **API integration:** Replace mock data and handlers with real API calls as needed

## License
MIT
