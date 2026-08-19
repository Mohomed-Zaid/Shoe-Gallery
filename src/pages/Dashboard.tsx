import { useMemo, useState, type ElementType } from 'react';
import { CalendarClock, CircleDollarSign, PackageSearch, Search, ShoppingCart, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Alert, LoadingSpinner } from '../components/ui';
import { RegisterStatusCard } from '../components/cash-register/RegisterStatusCard';
import { formatCurrency } from '../utils/format';
import { getDashboardCards } from '../services/dashboardService';
import { getSubscriptionStatus, SUBSCRIPTION_QUERY_KEY, SUPER_ADMIN_EMAIL } from '../services/subscriptionService';
import * as categoryService from '../services/categoryService';
import * as productService from '../services/productService';
import * as settingsService from '../services/settingsService';
import type { Category, ProductVariant } from '../types';
import type { ProductWithRelations } from '../services/productService';

const TIME_ZONE = 'Asia/Colombo';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: ElementType }) {
  return <div className="glass-card min-w-0 p-3 sm:p-4"><div className="relative z-10 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[.14em] text-dashboard-text-label">{label}</p><p className="mt-1 truncate text-lg font-bold text-dashboard-text-primary sm:text-xl">{value}</p></div><div className="glass-icon h-9 w-9 shrink-0 text-dashboard-accent"><Icon size={17}/></div></div></div>;
}

function SubscriptionCard() {
  const { profile } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: SUBSCRIPTION_QUERY_KEY, queryFn: getSubscriptionStatus, refetchInterval: 5 * 60 * 1000 });
  const remaining = Math.max(0, Number(data?.days_remaining ?? 0));
  const expired = Boolean(data?.is_expired || data?.status === 'expired');
  const warning = !expired && remaining <= 7;
  const label = expired ? 'EXPIRED' : warning ? 'EXPIRING SOON' : 'ACTIVE';
  const tone = expired ? 'border-red-400/25 bg-red-500/10 text-red-300' : warning ? 'border-amber-400/25 bg-amber-500/10 text-amber-300' : 'border-dashboard-accent/25 bg-dashboard-accent/10 text-dashboard-accent';
  const canManage = profile?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  return <div className="glass-card p-4"><div className="relative z-10"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="glass-icon h-9 w-9 shrink-0 text-dashboard-accent"><CalendarClock size={17}/></div><div><p className="text-[11px] font-semibold uppercase tracking-wider text-dashboard-text-label">Subscription</p>{isLoading ? <p className="mt-1 text-sm text-dashboard-text-sub">Loading...</p> : <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>}</div></div>{canManage && <Link to="/admin/subscription" className="rounded-lg px-2 py-1 text-xs font-medium text-dashboard-accent hover:bg-dashboard-accent/10">Manage</Link>}</div>{error ? <p className="mt-3 text-sm text-red-300">Subscription status is unavailable.</p> : data && <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3 text-sm"><div><p className="text-xs text-dashboard-text-sub">Expiry Date</p><p className="mt-0.5 font-semibold text-dashboard-text-primary">{formatDate(data.expires_at)}</p></div><div><p className="text-xs text-dashboard-text-sub">Days Remaining</p><p className={`mt-0.5 font-semibold ${expired ? 'text-red-300' : warning ? 'text-amber-300' : 'text-dashboard-text-primary'}`}>{expired ? 'Expired' : `${remaining} ${remaining === 1 ? 'Day' : 'Days'}`}</p></div></div>}</div></div>;
}

interface DashboardProductData { products: ProductWithRelations[]; variants: ProductVariant[]; categories: Category[]; lowStockLimit: number }

async function getDashboardProductData(): Promise<DashboardProductData> {
  const [productsResult, variantsResult, categoriesResult, settingsResult] = await Promise.all([productService.getProductsWithRelations(), productService.getAllProductVariants(), categoryService.getCategories(), settingsService.getStoreSettings()]);
  const error = productsResult.error ?? variantsResult.error ?? categoriesResult.error;
  if (error) throw error;
  return { products: (productsResult.data ?? []) as ProductWithRelations[], variants: (variantsResult.data ?? []) as ProductVariant[], categories: (categoriesResult.data ?? []) as Category[], lowStockLimit: Number(settingsResult.data?.default_low_stock_limit ?? 10) };
}

function ProductCard({ product, variants, lowStockLimit }: { product: ProductWithRelations; variants: ProductVariant[]; lowStockLimit: number }) {
  const activeVariants = variants.filter((variant) => variant.is_active !== false);
  const stock = activeVariants.reduce((sum, variant) => sum + Math.max(Number(variant.stock_quantity), 0), 0);
  const prices = activeVariants.filter((variant) => variant.selling_price != null).map((variant) => Number(variant.selling_price)).filter(Number.isFinite);
  const minimumPrice = prices.length ? Math.min(...prices) : null;
  const maximumPrice = prices.length ? Math.max(...prices) : null;
  const price = minimumPrice == null || maximumPrice == null ? 'Price unavailable' : minimumPrice === maximumPrice ? formatCurrency(minimumPrice) : `${formatCurrency(minimumPrice)} - ${formatCurrency(maximumPrice)}`;
  const outOfStock = stock <= 0;
  const lowStock = !outOfStock && stock <= lowStockLimit;
  const stockLabel = outOfStock ? 'Out of Stock' : lowStock ? 'Low Stock' : 'In Stock';
  const stockTone = outOfStock ? 'bg-red-400/10 text-red-300' : lowStock ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300';
  return <Link to="/pos" aria-label={`Start a sale with ${product.name}`} className={`group flex min-h-[108px] min-w-0 flex-col rounded-xl border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-dashboard-accent ${outOfStock ? 'border-white/[.06] bg-white/[.02] opacity-60' : 'border-white/10 bg-white/[.045] hover:-translate-y-0.5 hover:border-dashboard-accent/40 hover:bg-dashboard-accent/[.08]'}`}><div className="flex min-w-0 items-start justify-between gap-2"><h3 className="line-clamp-2 text-sm font-bold leading-tight text-dashboard-text-primary">{product.name}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${stockTone}`}>{stockLabel}</span></div><p className="mt-1 truncate text-[11px] text-dashboard-text-sub">Article: {product.item_article || product.item_number || product.code}</p><div className="mt-auto flex items-end justify-between gap-2 pt-2"><p className="truncate text-xs font-bold text-dashboard-accent" title={price}>{price}</p><p className="shrink-0 text-[10px] font-medium text-dashboard-text-label">Stock: {stock}</p></div></Link>;
}

export function Dashboard() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const queryOptions = { staleTime: 60_000, refetchInterval: 120_000 };
  const { data: cards, isLoading: cardsLoading, error: cardsError } = useQuery({ queryKey: ['dashboardCards'], queryFn: getDashboardCards, ...queryOptions });
  const { data: productData, isLoading: productsLoading, error: productsError } = useQuery({ queryKey: ['dashboardProducts'], queryFn: getDashboardProductData, ...queryOptions });
  const variantsByProduct = useMemo(() => (productData?.variants ?? []).reduce<Record<string, ProductVariant[]>>((result, variant) => { (result[variant.product_id] ??= []).push(variant); return result; }, {}), [productData?.variants]);
  const products = useMemo(() => { const query = search.trim().toLowerCase(); return (productData?.products ?? []).filter((product) => product.is_active !== false).filter((product) => !categoryId || product.category_id === categoryId).filter((product) => !query || product.name.toLowerCase().includes(query) || product.item_article?.toLowerCase().includes(query) || product.item_number?.toLowerCase().includes(query) || product.code.toLowerCase().includes(query) || product.brand?.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); }, [categoryId, productData?.products, search]);
  const categories = useMemo(() => [...(productData?.categories ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [productData?.categories]);

  return <div className="dashboard-home min-w-0 space-y-4">
    <div><h1 className="text-xl font-bold text-dashboard-text-primary sm:text-2xl">Dashboard</h1><p className="mt-1 text-sm text-dashboard-text-sub">Start a sale or quickly find a product.</p></div>
    <section className="grid min-w-0 gap-3 lg:grid-cols-2"><RegisterStatusCard/><SubscriptionCard/></section>
    {cardsError && <Alert message="Unable to load today's summary."/>}
    <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Link to="/pos" className="group flex min-h-[86px] items-center justify-between gap-4 rounded-2xl border border-dashboard-accent/35 bg-gradient-to-r from-emerald-500/25 to-emerald-400/10 px-5 py-4 shadow-lg shadow-emerald-950/20 transition hover:border-dashboard-accent/60 hover:from-emerald-500/35 hover:to-emerald-400/15 focus:outline-none focus:ring-2 focus:ring-dashboard-accent"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-200/80">Point of Sale</p><p className="mt-1 text-xl font-black tracking-wide text-white sm:text-2xl">NEW SALE</p></div><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 text-emerald-950 shadow-lg transition group-hover:scale-105"><ShoppingCart size={26}/></span></Link>
      {cardsLoading ? <div className="glass-card flex min-h-[86px] items-center justify-center sm:col-span-1 lg:col-span-3"><LoadingSpinner/></div> : <><MetricCard label="Today's Sales" value={(cards?.todaySales ?? 0).toLocaleString()} icon={WalletCards}/><MetricCard label="Today's Revenue" value={formatCurrency(cards?.todayRevenue ?? 0)} icon={ShoppingCart}/><Link to="/reports/expenses" className="min-w-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-dashboard-accent" aria-label="Open Expenses Report"><MetricCard label="Today's Expenses" value={formatCurrency(cards?.todayExpenses ?? 0)} icon={CircleDollarSign}/></Link></>}
    </section>
    <section className="glass-card min-w-0 overflow-hidden p-0">
      <div className="relative z-10 border-b border-white/[.08] p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-dashboard-text-primary">Products</h2><p className="mt-0.5 text-xs text-dashboard-text-sub">Tap a product to continue to the POS.</p></div>{!productsLoading && <span className="rounded-full bg-white/[.06] px-2.5 py-1 text-xs text-dashboard-text-sub">{products.length} products</span>}</div><div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or article..." className="dashboard-input min-h-11 w-full pl-10"/></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setCategoryId('')} className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition ${categoryId === '' ? 'border-dashboard-accent/50 bg-dashboard-accent/20 text-dashboard-accent' : 'border-white/10 bg-white/[.035] text-dashboard-text-label hover:bg-white/[.07]'}`}>All</button>{categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition ${categoryId === category.id ? 'border-dashboard-accent/50 bg-dashboard-accent/20 text-dashboard-accent' : 'border-white/10 bg-white/[.035] text-dashboard-text-label hover:bg-white/[.07]'}`}>{category.name}</button>)}</div></div>
      <div className="relative z-10 p-3 sm:p-4">{productsError ? <Alert message="Unable to load products."/> : productsLoading ? <LoadingSpinner/> : products.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-dashboard-text-sub"><PackageSearch size={28}/><p className="mt-2 text-sm">No products match the current filters.</p></div> : <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">{products.map((product) => <ProductCard key={product.id} product={product} variants={variantsByProduct[product.id] ?? []} lowStockLimit={productData?.lowStockLimit ?? 10}/>)}</div>}</div>
    </section>
  </div>;
}