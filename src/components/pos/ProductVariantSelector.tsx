import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImageIcon, ShoppingCart } from 'lucide-react';
import type { ProductVariant } from '../../types';
import type { POSProduct } from '../../services/productService';
import { Button, Input, Modal } from '../ui';
import { formatCurrency } from '../../utils/format';

interface Props {
  product: POSProduct;
  cartQuantities: Record<string, number>;
  lowStockLimit: number;
  keepOpen: boolean;
  onKeepOpenChange: (value: boolean) => void;
  onAdd: (variant: ProductVariant, quantity: number) => boolean;
  onClose: () => void;
  onViewCart: () => void;
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function ProductVariantSelector({ product, cartQuantities, lowStockLimit, keepOpen, onKeepOpenChange, onAdd, onClose, onViewCart }: Props) {
  const [quantity, setQuantity] = useState(1);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const variants = useMemo(() => product.product_variants.filter((v) => v.is_active !== false), [product]);
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size))].sort(naturalCompare), [variants]);
  const colours = useMemo(() => [...new Set(variants.map((v) => v.color))].sort(naturalCompare), [variants]);
  const totalStock = variants.reduce((sum, variant) => sum + Math.max(Number(variant.stock_quantity), 0), 0);
  const prices = variants.map((variant) => Number(variant.selling_price));
  const basePrice = prices.length ? Math.min(...prices) : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => buttonRefs.current.find((button) => button && !button.disabled)?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, []);

  const add = (variant: ProductVariant) => {
    const added = onAdd(variant, Math.max(1, Math.floor(quantity || 1)));
    if (added && !keepOpen) onClose();
  };

  const moveFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = index + 1;
    else if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowDown') next = index + colours.length;
    else if (event.key === 'ArrowUp') next = index - colours.length;
    else return;
    event.preventDefault();
    const direction = next > index ? 1 : -1;
    while (next >= 0 && next < buttonRefs.current.length && buttonRefs.current[next]?.disabled) next += direction;
    buttonRefs.current[next]?.focus();
  };

  return <Modal title="Select Product Variant" onClose={onClose} size="xl">
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[.04] p-3 sm:p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-dashboard-accent/15 sm:h-16 sm:w-16">
          {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover"/> : <ImageIcon className="text-dashboard-text-sub"/>}
        </div>
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-sky-300">{product.item_number || product.code}</p><h2 className="text-xl font-bold text-dashboard-text-primary">{product.name}</h2><p className="text-sm text-dashboard-text-sub">{product.brand?.name || 'Unbranded'} · {product.category?.name || 'Uncategorized'}</p></div>
        <div className="text-right"><p className="font-semibold">From {formatCurrency(basePrice)}</p><p className="text-sm text-emerald-300">{totalStock} total available</p></div>
      </header>

      {!variants.length ? <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-200">This product has no active variants.</div> : <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-32"><Input label="Add quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}/></div>
          <label className="flex items-center gap-2 text-sm text-dashboard-text-label"><input type="checkbox" checked={keepOpen} onChange={(e) => onKeepOpenChange(e.target.checked)}/>Keep Variant Grid Open After Adding</label>
        </div>

        <div className="max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/10 p-1">
          <table className="w-max border-separate border-spacing-1.5"><thead><tr><th className="sticky left-0 z-10 min-w-20 rounded-lg bg-[#071b15] p-2 text-left text-xs uppercase tracking-wide text-dashboard-text-sub">Size</th>{colours.map((colour) => <th key={colour} className="min-w-36 rounded-lg bg-[#071b15] p-2 text-center text-sm capitalize text-dashboard-text-label">{colour}</th>)}</tr></thead>
            <tbody>{sizes.map((size, row) => <tr key={size}><th className="sticky left-0 z-10 rounded-lg bg-[#071b15] p-2 text-left text-base text-dashboard-text-primary">{size}</th>{colours.map((colour, column) => {
              const variant = variants.find((v) => v.size === size && v.color === colour); const index = row * colours.length + column; const stock = Number(variant?.stock_quantity ?? 0); const inCart = variant ? cartQuantities[variant.id] ?? 0 : 0; const unavailable = !variant || stock <= 0;
              return <td key={colour}><button ref={(node) => { buttonRefs.current[index] = node; }} type="button" disabled={unavailable} onClick={() => variant && add(variant)} onKeyDown={(e) => moveFocus(e, index)} className={`min-h-20 w-36 rounded-xl border p-2 text-center transition focus:outline-none focus:ring-2 focus:ring-sky-400 ${unavailable ? 'cursor-not-allowed border-white/5 bg-white/[.02] text-dashboard-text-sub opacity-55' : stock <= lowStockLimit ? 'border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20' : 'border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/20'}`}>
                {!variant ? '—' : <><strong className="block">{stock > 0 ? `Stock: ${stock}` : 'Out of Stock'}</strong><span className="mt-1 block text-xs">{formatCurrency(Number(variant.selling_price))}</span>{inCart > 0 && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-400/20 px-2 py-1 text-xs text-sky-200"><Check size={11}/>In Cart: {inCart}</span>}</>}
              </button></td>})}</tr>)}</tbody></table>
        </div>

        <div className="hidden">{variants.sort((a, b) => naturalCompare(a.size, b.size) || naturalCompare(a.color, b.color)).map((variant) => { const stock=Number(variant.stock_quantity); const inCart=cartQuantities[variant.id]??0; return <article key={variant.id} className="rounded-xl border border-white/10 bg-white/[.04] p-4"><div className="flex justify-between"><strong>{variant.size} / {variant.color}</strong><span className={stock <= 0 ? 'text-red-300' : stock <= lowStockLimit ? 'text-amber-300' : 'text-emerald-300'}>{stock > 0 ? `Stock ${stock}` : 'Out of Stock'}</span></div><p className="mt-1 text-xs text-dashboard-text-sub">Barcode: {variant.barcode_number || '—'}</p><p className="mt-2 font-semibold">{formatCurrency(Number(variant.selling_price))}</p>{inCart > 0 && <p className="mt-1 text-xs text-sky-300">In Cart: {inCart}</p>}<Button className="mt-3 w-full" disabled={stock <= 0} onClick={() => add(variant)}><ShoppingCart size={15}/>Add to Invoice</Button></article>})}</div>

        <div className="flex flex-wrap gap-4 text-xs text-dashboard-text-sub"><span className="text-emerald-300">● Available</span><span className="text-amber-300">● Low Stock (≤ {lowStockLimit})</span><span className="text-red-300">● Out of Stock</span><span className="text-sky-300">● In Cart</span></div>
      </>}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3"><Button variant="outline" onClick={onViewCart}>View Cart</Button><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={onClose}>Done</Button></footer>
    </div>
  </Modal>;
}
