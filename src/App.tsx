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
import { SalesReportPage } from './pages/SalesReportPage';
import { SalesReturnsPage } from './pages/SalesReturnsPage';
import { CreateSalesReturnPage } from './pages/CreateSalesReturnPage';
import { SalesReturnDetailsPage } from './pages/SalesReturnDetailsPage';
import { CashRegisterPage } from './pages/CashRegisterPage';
import { CashRegisterGuard } from './components/cash-register/CashRegisterGuard';
import { Settings } from './pages/Settings';
import { SubscriptionGuard } from './components/auth/SubscriptionGuard';
import { SubscriptionExpiredPage } from './pages/SubscriptionExpiredPage';
import { SubscriptionManagementPage } from './pages/admin/SubscriptionManagementPage';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/subscription-expired" element={<ProtectedRoute><SubscriptionGuard><SubscriptionExpiredPage /></SubscriptionGuard></ProtectedRoute>} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <SubscriptionGuard><DashboardLayout>
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
                      <Route path="/purchases/:id/edit" element={<ProtectedRoute allowedRoles={['admin']}><CreatePurchase /></ProtectedRoute>} />
                      <Route path="/purchases/:id" element={<ProtectedRoute allowedRoles={['admin']}><PurchaseDetail /></ProtectedRoute>} />
                      <Route path="/inventory" element={<ProtectedRoute allowedRoles={['admin']}><Inventory /></ProtectedRoute>} />
                      <Route path="/customers" element={<Customers />} />
                      <Route path="/customers/:id" element={<CustomerDetail />} />
                      <Route path="/pos" element={<CashRegisterGuard><POS /></CashRegisterGuard>} />
                      <Route path="/cash-register" element={<CashRegisterPage />} />
                      <Route path="/sales" element={<Sales />} />
                      <Route path="/sales/:id" element={<SaleDetail />} />
                      <Route path="/returns" element={<SalesReturnsPage />} />
                      <Route path="/returns/new" element={<CreateSalesReturnPage />} />
                      <Route path="/returns/:id" element={<SalesReturnDetailsPage />} />
                      <Route path="/reports" element={<ProtectedRoute allowedRoles={['admin']}><Reports /></ProtectedRoute>} />
                      <Route path="/reports/sales" element={<SalesReportPage />} />
                      <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
                      <Route path="/admin/subscription" element={<SubscriptionManagementPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </DashboardLayout></SubscriptionGuard>
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
