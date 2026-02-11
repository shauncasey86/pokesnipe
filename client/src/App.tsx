import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ExpansionBrowser from './pages/catalog/ExpansionBrowser'
import ExpansionDetail from './pages/catalog/ExpansionDetail'
import CardDetailPage from './pages/catalog/CardDetailPage'
import SearchResults from './pages/catalog/SearchResults'
import TrendingCards from './pages/catalog/TrendingCards'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg0)', color: 'var(--tMut)',
        fontFamily: "'DM Mono', monospace", fontSize: 12,
      }}>
        Loading...
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}

function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/catalog" element={<CatalogLayout><ExpansionBrowser /></CatalogLayout>} />
          <Route path="/catalog/expansions/:id" element={<CatalogLayout><ExpansionDetail /></CatalogLayout>} />
          <Route path="/catalog/cards/:id" element={<CatalogLayout><CardDetailPage /></CatalogLayout>} />
          <Route path="/catalog/search" element={<CatalogLayout><SearchResults /></CatalogLayout>} />
          <Route path="/catalog/trending" element={<CatalogLayout><TrendingCards /></CatalogLayout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
