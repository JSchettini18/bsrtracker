import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProductDetail from './pages/ProductDetail';
import Alerts from './pages/Alerts';
import Compare from './pages/Compare';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products/:asin" element={<ProductDetail />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/compare" element={<Compare />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  );
}
