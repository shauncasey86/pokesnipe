import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import ExpansionBrowser from './pages/catalog/ExpansionBrowser'
import ExpansionDetail from './pages/catalog/ExpansionDetail'
import CardDetailPage from './pages/catalog/CardDetailPage'
import SearchResults from './pages/catalog/SearchResults'
import TrendingCards from './pages/catalog/TrendingCards'

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/catalog" replace />} />
        <Route path="/catalog" element={<ExpansionBrowser />} />
        <Route path="/catalog/expansions/:id" element={<ExpansionDetail />} />
        <Route path="/catalog/cards/:id" element={<CardDetailPage />} />
        <Route path="/catalog/search" element={<SearchResults />} />
        <Route path="/catalog/trending" element={<TrendingCards />} />
      </Routes>
    </BrowserRouter>
  )
}
