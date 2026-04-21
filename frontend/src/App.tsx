import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Join from './pages/Join';
import Interview from './pages/Interview';
import Done from './pages/Done';
import AdminSetup from './pages/admin/Setup';
import AdminLogin from './pages/admin/Login';
import AdminSessions from './pages/admin/Sessions';
import AdminSessionDetail from './pages/admin/SessionDetail';
import AdminResponses from './pages/admin/Responses';
import AdminSynthesis from './pages/admin/Synthesis';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Camper-facing routes */}
        <Route path="/join" element={<Join />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/done" element={<Done />} />

        {/* Admin routes */}
        <Route path="/admin/setup" element={<AdminSetup />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/sessions" element={<AdminSessions />} />
        <Route path="/admin/sessions/:id" element={<AdminSessionDetail />} />
        <Route path="/admin/sessions/:id/responses" element={<AdminResponses />} />
        <Route path="/admin/sessions/:id/synthesis" element={<AdminSynthesis />} />

        {/* Redirects */}
        <Route path="/admin" element={<Navigate to="/admin/sessions" replace />} />
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
