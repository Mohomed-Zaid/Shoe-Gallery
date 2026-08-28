import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ChevronDown, CreditCard, LogOut, Menu, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNavItemsForRole, getPageTitle } from '../utils/navigation';
import { isBusinessAdminEmail, SUPER_ADMIN_EMAIL } from '../services/subscriptionService';
import { CashRegisterLifecycle } from '../components/cash-register/CashRegisterLifecycle';

interface DashboardLayoutProps { children: ReactNode }

const SIDEBAR_STORAGE_KEY = 'shoe-gallery-sidebar-collapsed';

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuItems = getNavItemsForRole(isBusinessAdminEmail(user?.email) ? 'admin' : profile?.role);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(() => location.pathname === '/reports' || location.pathname.startsWith('/reports/'));
  const [reportsFlyoutOpen, setReportsFlyoutOpen] = useState(false);
  const [reportsFlyoutTop, setReportsFlyoutTop] = useState(0);
  const reportsButtonRef = useRef<HTMLButtonElement>(null);
  const flyoutCloseTimer = useRef<number | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return saved == null ? window.innerWidth <= 1366 : saved === 'true';
  });
  const effectiveCollapsed = !isMobile && collapsed;

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
    document.body.style.overflow = isMobile && mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, mobileOpen]);

  useEffect(() => { if (isMobile) setMobileOpen(false); }, [isMobile, location.pathname]);

  useEffect(() => {
    if (location.pathname === '/reports' || location.pathname.startsWith('/reports/')) setReportsOpen(true);
    setReportsFlyoutOpen(false);
  }, [location.pathname]);

  useEffect(() => () => window.clearTimeout(flyoutCloseTimer.current), []);

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const toggleSidebar = () => {
    if (isMobile) setMobileOpen((open) => !open);
    else {
      const next = !collapsed;
      setCollapsed(next);
      setReportsFlyoutOpen(false);
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    }
  };
  const handleSignOut = async () => { await signOut(); navigate('/login'); };
  const showSidebar = !isMobile || mobileOpen;

  const navLink = (path: string, label: string, Icon: typeof CreditCard, end = false) => (
    <NavLink key={path} to={path} end={end} title={effectiveCollapsed ? label : undefined} aria-label={label}
      onClick={() => isMobile && setMobileOpen(false)}
      className={({ isActive }) => `nav-item ${effectiveCollapsed ? 'justify-center px-2' : ''} ${isActive ? 'nav-active' : 'text-dashboard-text-label hover:bg-dashboard-hover hover:text-dashboard-text-primary'}`}>
      <Icon size={19}/>{!effectiveCollapsed && <span className="truncate font-medium">{label}</span>}
    </NavLink>
  );

  const reportMenu = menuItems.find((item) => item.path === '/reports');
  const primaryMenuItems = menuItems.filter((item) => item.path !== '/reports');
  const openReportsFlyout = () => {
    window.clearTimeout(flyoutCloseTimer.current);
    const buttonTop = reportsButtonRef.current?.getBoundingClientRect().top ?? 0;
    setReportsFlyoutTop(Math.min(buttonTop, window.innerHeight - 340));
    setReportsFlyoutOpen(true);
  };
  const closeReportsFlyout = () => {
    flyoutCloseTimer.current = window.setTimeout(() => setReportsFlyoutOpen(false), 120);
  };
  const toggleReports = () => {
    const enteringReports = !location.pathname.startsWith('/reports');
    if (effectiveCollapsed) {
      openReportsFlyout();
      return;
    }
    if (enteringReports) {
      setReportsOpen(true);
      navigate('/reports');
      return;
    }
    setReportsOpen((open) => !open);
  };

  const reportsNavigation = reportMenu && (
    <div className="min-w-0" onMouseEnter={effectiveCollapsed ? openReportsFlyout : undefined} onMouseLeave={effectiveCollapsed ? closeReportsFlyout : undefined}>
      <button
        ref={reportsButtonRef}
        type="button"
        onClick={toggleReports}
        title={effectiveCollapsed ? 'Reports' : undefined}
        aria-label="Reports"
        aria-expanded={effectiveCollapsed ? reportsFlyoutOpen : reportsOpen}
        aria-haspopup="menu"
        className={`nav-item w-full ${effectiveCollapsed ? 'justify-center px-2' : ''} ${location.pathname.startsWith('/reports') ? 'nav-active' : 'text-dashboard-text-label hover:bg-dashboard-hover hover:text-dashboard-text-primary'}`}
      >
        <BarChart3 size={19} className="shrink-0" />
        {!effectiveCollapsed && <><span className="min-w-0 flex-1 truncate text-left font-medium">Reports</span><ChevronDown size={16} className={`shrink-0 transition-transform ${reportsOpen ? 'rotate-180' : ''}`} /></>}
      </button>
      {!effectiveCollapsed && reportsOpen && (
        <div className="mt-1 min-w-0 space-y-1 border-l border-white/10 pl-3 ml-4">
          {reportMenu.children?.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => isMobile && setMobileOpen(false)}
              className={({ isActive }) => `block min-w-0 truncate rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-dashboard-accent/15 text-dashboard-accent' : 'text-dashboard-text-sub hover:bg-dashboard-hover hover:text-dashboard-text-primary'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
      {effectiveCollapsed && reportsFlyoutOpen && reportMenu.children && createPortal(
        <div
          className="reports-flyout fixed z-[60] w-56 rounded-xl border border-white/15 bg-[#061a14]/95 p-2 shadow-2xl backdrop-blur-xl"
          style={{ left: '4.5rem', top: Math.max(8, reportsFlyoutTop) }}
          onMouseEnter={() => window.clearTimeout(flyoutCloseTimer.current)}
          onMouseLeave={closeReportsFlyout}
          role="menu"
          aria-label="Reports submenu"
        >
          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-dashboard-text-sub">Reports</p>
          {reportMenu.children.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              role="menuitem"
              className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-dashboard-accent/15 text-dashboard-accent' : 'text-dashboard-text-label hover:bg-dashboard-hover hover:text-dashboard-text-primary'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );

  return <><CashRegisterLifecycle/><div
    className="flex min-h-screen min-w-0 bg-dashboard-bg-deep"
    style={{ '--sidebar-width': isMobile ? '0px' : effectiveCollapsed ? '4.5rem' : '16rem' } as CSSProperties}
  >
    {isMobile && mobileOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm" onClick={() => setMobileOpen(false)}/>}
    {showSidebar && <aside data-collapsed={effectiveCollapsed} className={`glass-sidebar z-40 shrink-0 transition-[width,transform] duration-200 ease-in-out ${isMobile ? 'fixed inset-y-0 left-0 w-[min(17rem,86vw)] overflow-y-auto' : effectiveCollapsed ? 'w-[4.5rem]' : 'w-64'}`}>
      <div className={`flex items-center border-b border-white/10 p-4 ${effectiveCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex min-w-0 items-center gap-3"><img src="/shoe_gallery.jpeg" alt="Shoe Gallery Logo" className="h-9 w-9 shrink-0 rounded-lg object-cover"/>{!effectiveCollapsed && <div className="min-w-0"><h1 className="truncate text-base font-bold text-dashboard-text-primary">Shoe Gallery</h1><p className="truncate text-[11px] text-dashboard-text-sub">Management System</p></div>}</div>
        {isMobile && <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-dashboard-text-sub hover:bg-dashboard-hover" aria-label="Close menu"><X size={19}/></button>}
      </div>
      <nav className="min-w-0 space-y-1 overflow-y-auto overflow-x-hidden p-3">{primaryMenuItems.map((item) => navLink(item.path,item.label,item.icon,item.path==='/'))}{reportsNavigation}{user?.email?.toLowerCase()===SUPER_ADMIN_EMAIL && navLink('/admin/subscription','Subscription Management',CreditCard)}</nav>
    </aside>}

    <div className="dashboard-page flex min-w-0 flex-1 flex-col">
      <header className="glass-header flex min-w-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-2"><button type="button" onClick={toggleSidebar} className="shrink-0 rounded-lg p-2 text-dashboard-text-label transition-colors hover:bg-dashboard-hover hover:text-dashboard-text-primary" aria-label={isMobile ? (mobileOpen ? 'Close menu' : 'Open menu') : (effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar')} aria-expanded={isMobile ? mobileOpen : !effectiveCollapsed}><Menu size={20}/></button><h2 className="truncate text-sm font-semibold text-dashboard-text-primary sm:text-base">{getPageTitle(location.pathname)}</h2></div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2"><button type="button" className="rounded-lg p-2 text-dashboard-text-label hover:bg-dashboard-hover" aria-label="Theme"><Sun size={18}/></button><div className="hidden items-center gap-2 lg:flex"><div className="profile-avatar">{initial}</div><p className="max-w-32 truncate text-sm font-semibold text-dashboard-text-primary">{displayName}</p></div><button type="button" onClick={handleSignOut} className="logout-btn" aria-label="Logout"><LogOut size={16}/><span className="hidden xl:inline">Logout</span></button></div>
      </header>
      <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-5">{children}</main>
    </div>
  </div></>;
}
