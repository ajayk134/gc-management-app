import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import AdminDashboard from './pages/AdminDashboard';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/user" />;
  if (!adminOnly && user.role === 'admin') return <Navigate to="/admin" />;
  
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/user'} /> : <Login />} />
      <Route path="/user" element={
        <ProtectedRoute><UserDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/*" element={
        <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/user') : '/login'} />} />
    </Routes>
  );
}

export default function App() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            className: 'toast-custom',
            style: dark
              ? {
                  background: 'var(--surface-elevated)',
                  color: 'var(--gray-800)',
                  border: '1px solid var(--gray-200)',
                  boxShadow: 'var(--shadow-lg)',
                }
              : {},
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
