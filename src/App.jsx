import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider } from './context/StoreContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Customers from './pages/Customers';
import Rentals from './pages/Rentals';
import Maintenance from './pages/Maintenance';
import Bonds from './pages/Bonds';
import Settings from './pages/Settings';
import ContractPage from './pages/ContractPage';
import CustomerIntake from './pages/CustomerIntake';

function AdminApp() {
  return (
    <StoreProvider>
      <Routes>
        <Route path="/contract" element={<ProtectedRoute><ContractPage /></ProtectedRoute>} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/"            element={<Dashboard />} />
                <Route path="/vehicles"    element={<Vehicles />} />
                <Route path="/customers"   element={<Customers />} />
                <Route path="/rentals"     element={<Rentals />} />
                <Route path="/maintenance" element={<Maintenance />} />
                <Route path="/bonds"       element={<Bonds />} />
                <Route path="/settings"    element={<Settings />} />
                <Route path="*"            element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
      </Routes>
    </StoreProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"  element={<Login />} />
        <Route path="/intake" element={<CustomerIntake />} />
        <Route path="/*"      element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  );
}
