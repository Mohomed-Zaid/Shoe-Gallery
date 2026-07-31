import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Categories } from './pages/Categories';
import { Brands } from './pages/Brands';
import { Products } from './pages/Products';
import { ProductDetail } from './pages/ProductDetail';
import { BarcodePrinting } from './pages/BarcodePrinting';
import { Suppliers } from './pages/Suppliers';
import { Inventory } from './pages/Inventory';
import { Purchases } from './pages/Purchases';
import { CreatePurchase } from './pages/CreatePurchase';
import { PurchaseDetail } from './pages/PurchaseDetail';
import { Customers } from './pages/Customers';
import { CustomerDetail } from './pages/CustomerDetail';
import { POS } from './pages/POS';
import { Sales } from './pages/Sales';
import { SaleDetail } from './pages/SaleDetail';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/categories" element={<ProtectedRoute allowedRoles={['admin']}><Categories /></ProtectedRoute>} />
                      <Route path="/brands" element={<ProtectedRoute allowedRoles={['admin']}><Brands /></ProtectedRoute>} />
                      <Route path="/products" element={<ProtectedRoute allowedRoles={['admin']}><Products /></ProtectedRoute>} />
                      <Route path="/products/:id" element={<ProtectedRoute allowedRoles={['admin']}><ProductDetail /></ProtectedRoute>} />
                      <Route path="/barcode-printing" element={<BarcodePrinting />} />
                      <Route path="/suppliers" element={<ProtectedRoute allowedRoles={['admin']}><Suppliers /></ProtectedRoute>} />
                      <Route path="/purchases" element={<ProtectedRoute allowedRoles={['admin']}><Purchases /></ProtectedRoute>} />
                      <Route path="/purchases/create" element={<ProtectedRoute allowedRoles={['admin']}><CreatePurchase /></ProtectedRoute>} />
                      <Route path="/purchases/:id" element={<ProtectedRoute allowedRoles={['admin']}><PurchaseDetail /></ProtectedRoute>} />
                      <Route path="/inventory" element={<ProtectedRoute allowedRoles={['admin']}><Inventory /></ProtectedRoute>} />
                      <Route path="/customers" element={<Customers />} />
                      <Route path="/customers/:id" element={<CustomerDetail />} />
                      <Route path="/pos" element={<POS />} />
                      <Route path="/sales" element={<Sales />} />
                      <Route path="/sales/:id" element={<SaleDetail />} />
                      <Route path="/reports" element={<ProtectedRoute allowedRoles={['admin']}><Reports /></ProtectedRoute>} />
                      <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
