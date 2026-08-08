import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CreditCard, LogOut, Menu, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNavItemsForRole, getPageTitle } from '../utils/navigation';
import { isBusinessAdminEmail, SUPER_ADMIN_EMAIL } from '../services/subscriptionService';

interface DashboardLayoutProps { children: ReactNode }

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const menuItems = getNavItemsForRole(isBusinessAdminEmail(user?.email) ? 'admin' : profile?.role);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved == null ? window.innerWidth < 1180 : saved === 'true';
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

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();
  const toggleSidebar = () => {
    if (isMobile) setMobileOpen((open) => !open);
    else { const next = !collapsed; setCollapsed(next); localStorage.setItem('sidebar-collapsed', String(next)); }
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

  return <div
    className="flex min-h-screen min-w-0 bg-dashboard-bg-deep"
    style={{ '--sidebar-width': isMobile ? '0px' : effectiveCollapsed ? '4.5rem' : '16rem' } as CSSProperties}
  >
    {isMobile && mobileOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm" onClick={() => setMobileOpen(false)}/>}
    {showSidebar && <aside className={`glass-sidebar z-40 shrink-0 transition-[width,transform] duration-200 ${isMobile ? 'fixed inset-y-0 left-0 w-[min(17rem,86vw)] overflow-y-auto' : effectiveCollapsed ? 'w-[4.5rem]' : 'w-64'}`}>
      <div className={`flex items-center border-b border-white/10 p-4 ${effectiveCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex min-w-0 items-center gap-3"><img src="/shoe_gallery.jpeg" alt="Shoe Gallery Logo" className="h-9 w-9 shrink-0 rounded-lg object-cover"/>{!effectiveCollapsed && <div className="min-w-0"><h1 className="truncate text-base font-bold text-dashboard-text-primary">Shoe Gallery</h1><p className="truncate text-[11px] text-dashboard-text-sub">Management System</p></div>}</div>
        {isMobile && <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-dashboard-text-sub hover:bg-dashboard-hover" aria-label="Close menu"><X size={19}/></button>}
      </div>
      <nav className="space-y-1 overflow-y-auto p-3">{menuItems.map((item) => navLink(item.path,item.label,item.icon,item.path==='/'))}{user?.email?.toLowerCase()===SUPER_ADMIN_EMAIL && navLink('/admin/subscription','Subscription Management',CreditCard)}</nav>
      {!isMobile && <button type="button" onClick={toggleSidebar} title={effectiveCollapsed?'Expand sidebar':'Collapse sidebar'} className="absolute bottom-4 right-0 translate-x-1/2 rounded-full border border-white/15 bg-emerald-950 p-1.5 text-white shadow-lg">{effectiveCollapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}</button>}
    </aside>}

    <div className="dashboard-page flex min-w-0 flex-1 flex-col">
      <header className="glass-header flex min-w-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-2"><button type="button" onClick={toggleSidebar} className="shrink-0 rounded-lg p-2 text-dashboard-text-label hover:bg-dashboard-hover" aria-label="Toggle menu"><Menu size={20}/></button><h2 className="truncate text-sm font-semibold text-dashboard-text-primary sm:text-base">{getPageTitle(location.pathname)}</h2></div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2"><button type="button" className="rounded-lg p-2 text-dashboard-text-label hover:bg-dashboard-hover" aria-label="Theme"><Sun size={18}/></button><div className="hidden items-center gap-2 lg:flex"><div className="profile-avatar">{initial}</div><p className="max-w-32 truncate text-sm font-semibold text-dashboard-text-primary">{displayName}</p></div><button type="button" onClick={handleSignOut} className="logout-btn" aria-label="Logout"><LogOut size={16}/><span className="hidden xl:inline">Logout</span></button></div>
      </header>
      <main className="relative z-10 min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 lg:p-5">{children}</main>
    </div>
  </div>;
}
