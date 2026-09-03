import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
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
import { Suppliers } from './pages/Suppliers';
import { Inventory } from './pages/Inventory';
import { InventorySheetPage } from './pages/InventorySheetPage';
import { Purchases } from './pages/Purchases';
import { CreatePurchase } from './pages/CreatePurchase';
import { PurchaseDetail } from './pages/PurchaseDetail';
import { Customers } from './pages/Customers';
import { CustomerDetail } from './pages/CustomerDetail';
import { Sales } from './pages/Sales';
import { SaleDetail } from './pages/SaleDetail';
import { SalesReturnsPage } from './pages/SalesReturnsPage';
import { CreateSalesReturnPage } from './pages/CreateSalesReturnPage';
import { SalesReturnDetailsPage } from './pages/SalesReturnDetailsPage';
import { CashRegisterPage } from './pages/CashRegisterPage';
import { CashRegisterGuard } from './components/cash-register/CashRegisterGuard';
import { Settings } from './pages/Settings';
import { SubscriptionGuard } from './components/auth/SubscriptionGuard';
import { SubscriptionExpiredPage } from './pages/SubscriptionExpiredPage';
import { SubscriptionManagementPage } from './pages/admin/SubscriptionManagementPage';
import { LoadingSpinner } from './components/ui';
import { PWAStatus } from './components/pwa/PWAStatus';
import { ReportsHomePage } from './pages/ReportsHomePage';
import { InvoiceSalesReportPage } from './pages/InvoiceSalesReportPage';
import { PurchaseReportPage } from './pages/PurchaseReportPage';
import { InventoryReportPage } from './pages/InventoryReportPage';
import { ReturnsReportPage } from './pages/ReturnsReportPage';
import { ProfitReportPage } from './pages/ProfitReportPage';
import { CashupReportPage } from './pages/CashupReportPage';
import { ExpensesReportPage } from './pages/ExpensesReportPage';
import { CustomerDisplay } from './pages/CustomerDisplay';
import { Cheques } from './pages/Cheques';

const BarcodePrinting = lazy(() => import('./pages/BarcodePrinting').then((module) => ({ default: module.BarcodePrinting })));
const POS = lazy(() => import('./pages/POS').then((module) => ({ default: module.POS })));

function RouteAwarePWAStatus() {
  return useLocation().pathname === '/customer-display' ? null : <PWAStatus />;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <RouteAwarePWAStatus />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/subscription-expired" element={<ProtectedRoute><SubscriptionGuard><SubscriptionExpiredPage /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/customer-display" element={<ProtectedRoute><SubscriptionGuard><CustomerDisplay /></SubscriptionGuard></ProtectedRoute>} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <SubscriptionGuard><DashboardLayout>
                    <Suspense fallback={<LoadingSpinner />}><Routes>
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
                      <Route path="/inventory/:productId" element={<ProtectedRoute allowedRoles={['admin']}><InventorySheetPage /></ProtectedRoute>} />
                      <Route path="/customers" element={<Customers />} />
                      <Route path="/customers/:id" element={<CustomerDetail />} />
                      <Route path="/pos" element={<CashRegisterGuard><POS /></CashRegisterGuard>} />
                      <Route path="/cash-register" element={<CashRegisterPage />} />
                      <Route path="/sales" element={<Sales />} />
                      <Route path="/sales/:id" element={<SaleDetail />} />
                      <Route path="/returns" element={<SalesReturnsPage />} />
                      <Route path="/returns/new" element={<CreateSalesReturnPage />} />
                      <Route path="/returns/:id" element={<SalesReturnDetailsPage />} />
                      <Route path="/cheques" element={<Cheques />} />
                      <Route path="/reports" element={<ReportsHomePage />} />
                      <Route path="/reports/sales" element={<InvoiceSalesReportPage />} />
                      <Route path="/reports/purchases" element={<ProtectedRoute allowedRoles={['admin']}><PurchaseReportPage /></ProtectedRoute>} />
                      <Route path="/reports/inventory" element={<InventoryReportPage />} />
                      <Route path="/reports/returns" element={<ReturnsReportPage />} />
                      <Route path="/reports/profit" element={<ProfitReportPage />} />
                      <Route path="/reports/cashup" element={<CashupReportPage />} />
                      <Route path="/reports/expenses" element={<ExpensesReportPage />} />
                      <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
                      <Route path="/admin/subscription" element={<SubscriptionManagementPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes></Suspense>
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
