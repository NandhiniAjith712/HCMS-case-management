import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import UIApp from './ui/UIApp';
import HCMSApp from './hcms-ui/HCMSApp';
import './App.css';

/**
 * Main App Router - Separates two independent UI systems:
 * - /ui/* → Legacy ITSM system (old UI)
 * - /hcms/* → New HCMS Case Management system
 */
function App() {
  return (
    <Router>
      <Routes>
        {/* Legacy ITSM UI - all routes under /ui */}
        <Route path="/ui/*" element={<UIApp />} />

        {/* New HCMS UI - all routes under /hcms */}
        <Route path="/hcms/*" element={<HCMSApp />} />

        {/* Default redirect to HCMS login */}
        <Route path="/" element={<Navigate to="/hcms/login" replace />} />

        {/* Catch all - redirect to HCMS login */}
        <Route path="*" element={<Navigate to="/hcms/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
