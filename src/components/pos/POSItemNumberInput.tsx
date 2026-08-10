import { useEffect, useRef, useState } from 'react';
import { Hash, Search } from 'lucide-react';
import { Input } from '../ui';
import { getPOSProductByArticleNumber, getPOSProductById, searchPOSProducts } from '../../services/productService';
import type { POSProduct, POSProductSuggestion } from '../../services/productService';
import { getErrorMessage } from '../../utils/errors';

interface Props {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (product: POSProduct) => void;
  onError: (message: string | null) => void;
}

export function POSItemNumberInput({ inputRef, onSelect, onError }: Props) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<POSProductSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const id = ++requestId.current;
    const timer = window.setTimeout(async () => {
      const result = await searchPOSProducts(query);
      if (id !== requestId.current) return;
      if (result.error) onError(getErrorMessage(result.error));
      else {
        setSuggestions(result.data);
        setActiveIndex(0);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value, onError]);

  const loadProduct = async (productId: string) => {
    setLoading(true);
    const { data, error } = await getPOSProductById(productId);
    setLoading(false);
    if (error || !data) {
      onError(getErrorMessage(error, 'Product could not be loaded.'));
      return;
    }
    setValue('');
    setSuggestions([]);
    onError(null);
    onSelect(data as unknown as POSProduct);
  };

  const submit = async () => {
    const query = value.trim();
    if (!query) return;
    setLoading(true);
    const exact = await getPOSProductByArticleNumber(query);
    setLoading(false);
    if (exact.error) {
      onError(getErrorMessage(exact.error));
      return;
    }
    if (exact.data) {
      setValue('');
      setSuggestions([]);
      onError(null);
      onSelect(exact.data as unknown as POSProduct);
      return;
    }
    const result = await searchPOSProducts(query);
    if (result.error) onError(getErrorMessage(result.error));
    else if (result.data.length === 1) await loadProduct(result.data[0].id);
    else if (!result.data.length) onError('Article number not found.');
    else {
      setSuggestions(result.data);
      setActiveIndex(0);
      onError('No exact article number found. Choose a matching product.');
    }
  };

  return (
    <div className="relative space-y-2">
      <label htmlFor="pos-item-number" className="flex items-center justify-between text-sm font-medium text-dashboard-text-label">
        <span>Article Number</span><span className="text-xs font-normal">F2</span>
      </label>
      <div className="relative">
        <Input
          id="pos-item-number"
          ref={inputRef}
          value={value}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && suggestions.length) { event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1)); }
            else if (event.key === 'ArrowUp' && suggestions.length) { event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
            else if (event.key === 'Escape') setSuggestions([]);
            else if (event.key === 'Enter') {
              event.preventDefault();
              if (suggestions.length) void loadProduct(suggestions[activeIndex].id);
              else void submit();
            }
          }}
          placeholder="Type article number and press Enter"
          className="pl-10"
          disabled={loading}
        />
        <Hash className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16}/>
      </div>
      {suggestions.length > 0 && (
        <div role="listbox" className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-white/15 bg-slate-950 p-1 shadow-2xl">
          {suggestions.map((product, index) => (
            <button key={product.id} type="button" role="option" aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()} onClick={() => void loadProduct(product.id)}
              className={`flex w-full items-center justify-between gap-4 rounded-lg p-3 text-left ${index === activeIndex ? 'bg-dashboard-accent/20' : 'hover:bg-white/[.06]'}`}>
              <span><strong className="block text-sm text-dashboard-text-primary">{product.item_article || product.item_number || product.code} · {product.name}</strong><small className="text-dashboard-text-sub">{product.brand?.name || 'Unbranded'} · {product.category?.name || 'Uncategorized'}</small></span>
              <span className="whitespace-nowrap text-xs text-emerald-300">{product.total_stock} in stock</span>
            </button>
          ))}
          <p className="flex items-center gap-1 px-3 py-2 text-xs text-dashboard-text-sub"><Search size={12}/>Use ↑ ↓ and Enter to select</p>
        </div>
      )}
    </div>
  );
}
