import { type ReactNode, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, LogOut, Menu, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNavItemsForRole, getPageTitle } from '../utils/navigation';
import { isBusinessAdminEmail, SUPER_ADMIN_EMAIL } from '../services/subscriptionService';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuItems = getNavItemsForRole(isBusinessAdminEmail(user?.email) ? 'admin' : profile?.role);
  // Preserve horizontal working space on the smaller monitors commonly used at tills.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1180);

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-dashboard-bg-deep">
      {sidebarOpen && (
        <aside className="glass-sidebar z-30 w-64 shrink-0">
          <div className="flex items-center justify-between border-b border-white/10 p-5">
            <div className="flex items-center gap-3">
              <img src="/shoe_gallery.jpeg" alt="Shoe Gallery Logo" className="h-10 w-10 rounded-lg object-cover" />
              <div>
                <h1 className="text-base font-bold text-dashboard-text-primary">Shoe Gallery</h1>
                <p className="text-[11px] text-dashboard-text-sub">Management System</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-dashboard-text-sub hover:bg-dashboard-hover lg:hidden"
            >
              <X size={18} />
            </button>
          </div>
          <nav className="space-y-1 p-3">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'nav-active' : 'text-dashboard-text-label hover:bg-dashboard-hover hover:text-dashboard-text-primary'}`
                }
              >
                <item.icon size={18} />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
            {user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL && (
              <NavLink to="/admin/subscription" className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : 'text-dashboard-text-label hover:bg-dashboard-hover hover:text-dashboard-text-primary'}`}>
                <CreditCard size={18} /><span className="font-medium">Subscription Management</span>
              </NavLink>
            )}
          </nav>
        </aside>
      )}

      <div className="dashboard-page flex min-w-0 flex-1 flex-col">
        <header className="glass-header flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              className="rounded-lg p-2 text-dashboard-text-label transition-colors hover:bg-dashboard-hover hover:text-dashboard-text-primary"
              aria-label="Toggle menu"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-base font-semibold text-dashboard-text-primary">
              {getPageTitle(location.pathname)}
            </h2>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-dashboard-text-label transition-colors hover:bg-dashboard-hover hover:text-dashboard-text-primary"
              aria-label="Theme"
            >
              <Sun size={18} />
            </button>

            <div className="hidden items-center gap-2 sm:flex">
              <div className="profile-avatar">{initial}</div>
              <div className="text-sm leading-tight">
                <p className="font-semibold text-dashboard-text-primary">{displayName}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="logout-btn"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="relative z-10 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
