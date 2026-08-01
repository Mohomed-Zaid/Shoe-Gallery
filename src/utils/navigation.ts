import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingBag,
  ScanLine,
  Truck,
  ShoppingCart,
  Boxes,
  Users,
  CreditCard,
  ReceiptText,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '../types';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'cashier'] },
  { path: '/products', label: 'Products', icon: Package, roles: ['admin'] },
  { path: '/categories', label: 'Categories', icon: Tags, roles: ['admin'] },
  { path: '/brands', label: 'Brands', icon: ShoppingBag, roles: ['admin'] },
  { path: '/suppliers', label: 'Suppliers', icon: Truck, roles: ['admin'] },
  { path: '/purchases', label: 'Purchases', icon: ShoppingCart, roles: ['admin'] },
  { path: '/inventory', label: 'Inventory', icon: Boxes, roles: ['admin'] },
  { path: '/barcode-printing', label: 'Barcode Printing', icon: ScanLine, roles: ['admin', 'cashier'] },
  { path: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'cashier'] },
  { path: '/pos', label: 'POS', icon: CreditCard, roles: ['admin', 'cashier'] },
  { path: '/sales', label: 'Sales', icon: ReceiptText, roles: ['admin', 'cashier'] },
  { path: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export function getNavItemsForRole(role: UserRole | undefined): NavItem[] {
  if (!role) return [];
  return navItems.filter((item) => item.roles.includes(role));
}

export function getPageTitle(pathname: string): string {
  if (pathname === '/admin/subscription') return 'Subscription Management';
  const item = navItems.find((nav) => nav.path === pathname);
  if (item) return item.label;
  if (pathname.startsWith('/products/')) return 'Product Details';
  if (pathname === '/barcode-printing') return 'Barcode Printing';
  if (pathname.startsWith('/customers/')) return 'Customer Details';
  if (pathname.startsWith('/sales/')) return 'Sale Details';
  return 'Dashboard';
}
