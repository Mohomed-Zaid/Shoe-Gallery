import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, ShoppingBag } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import {
  CUSTOMER_DISPLAY_CHANNEL,
  CUSTOMER_DISPLAY_STORAGE_KEY,
  readCustomerDisplayFallback,
  sendCustomerDisplayFallback,
  type CustomerDisplayMessage,
  type CustomerDisplaySaleCompleted,
  type CustomerDisplaySnapshot,
} from '../types/customerDisplay';

const THANK_YOU_DURATION_MS = 8000;

const paymentLabels: Record<CustomerDisplaySnapshot['paymentMethod'], string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit',
};

function itemDescription(item: CustomerDisplaySnapshot['items'][number]) {
  const variant = [item.size, item.colour].filter((value) => value && value !== '-').join(' / ');
  return variant ? `${item.productName} - ${variant}` : item.productName;
}

export function CustomerDisplay() {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot | null>(null);
  const [completedSale, setCompletedSale] = useState<CustomerDisplaySaleCompleted | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const completionTimeoutRef = useRef<number | null>(null);

  const handleMessage = useCallback((message: CustomerDisplayMessage) => {
    if (message.type === 'STATE_UPDATE') {
      setSnapshot(message.payload);
      if (message.payload.items.length > 0) {
        setCompletedSale(null);
        if (completionTimeoutRef.current !== null) {
          window.clearTimeout(completionTimeoutRef.current);
          completionTimeoutRef.current = null;
        }
      }
      return;
    }

    if (message.type === 'SALE_COMPLETED') {
      setCompletedSale(message.payload);
      if (completionTimeoutRef.current !== null) {
        window.clearTimeout(completionTimeoutRef.current);
      }
      completionTimeoutRef.current = window.setTimeout(() => {
        setCompletedSale(null);
        completionTimeoutRef.current = null;
      }, THANK_YOU_DURATION_MS);
    }
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => handleMessage(event.data);
      channel.postMessage({ type: 'CUSTOMER_DISPLAY_READY' } satisfies CustomerDisplayMessage);
      const heartbeat = window.setInterval(() => {
        channel.postMessage({ type: 'CUSTOMER_DISPLAY_HEARTBEAT' } satisfies CustomerDisplayMessage);
      }, 3000);
      return () => {
        window.clearInterval(heartbeat);
        channel.close();
        if (completionTimeoutRef.current !== null) window.clearTimeout(completionTimeoutRef.current);
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMER_DISPLAY_STORAGE_KEY) return;
      const message = readCustomerDisplayFallback(event.newValue);
      if (message) handleMessage(message);
    };
    window.addEventListener('storage', handleStorage);
    sendCustomerDisplayFallback({ type: 'CUSTOMER_DISPLAY_READY' });
    const heartbeat = window.setInterval(() => {
      sendCustomerDisplayFallback({ type: 'CUSTOMER_DISPLAY_HEARTBEAT' });
    }, 3000);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('storage', handleStorage);
      if (completionTimeoutRef.current !== null) window.clearTimeout(completionTimeoutRef.current);
    };
  }, [handleMessage]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  };

  if (completedSale) {
    return (
      <main className="flex h-screen min-h-0 items-center justify-center overflow-hidden bg-[#f2ecdf] p-5 text-[#17251e] sm:p-10">
        <section className="w-full max-w-4xl rounded-[2rem] border-2 border-[#22543d]/20 bg-[#fffdf7] px-6 py-12 text-center shadow-2xl sm:px-12 sm:py-16">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#22543d] text-white">
            <ShoppingBag size={38} />
          </div>
          <p className="mt-8 text-sm font-bold uppercase tracking-[.32em] text-[#8a5b42]">{completedSale.storeName}</p>
          <h1 className="mt-3 text-5xl font-black tracking-tight text-[#173f2d] sm:text-7xl">THANK YOU</h1>
          <p className="mt-8 text-lg uppercase tracking-[.18em] text-[#6f766f]">Total</p>
          <p className="mt-2 text-4xl font-black tabular-nums text-[#173f2d] sm:text-6xl">{formatCurrency(completedSale.grandTotal)}</p>
          {completedSale.amountReceived > 0 && (
            <div className="mx-auto mt-8 grid max-w-xl gap-3 border-t border-[#22543d]/20 pt-6 text-xl sm:grid-cols-2">
              <p>Received <strong className="ml-2 tabular-nums">{formatCurrency(completedSale.amountReceived)}</strong></p>
              <p>Change <strong className="ml-2 tabular-nums">{formatCurrency(completedSale.changeDue)}</strong></p>
            </div>
          )}
          <p className="mt-10 text-xl text-[#59635d]">Thank you for shopping at Shoe Gallery.</p>
        </section>
      </main>
    );
  }

  const hasItems = Boolean(snapshot?.items.length);

  return (
    <main className="h-screen min-h-0 overflow-hidden bg-[#ded7c8] p-2 text-[#1c241f] sm:p-4 lg:p-6">
      <section className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-[#8f7b67]/35 bg-[#fffdf7] shadow-2xl">
        <header className="shrink-0 border-b-2 border-[#b35f73] px-4 py-3 sm:px-7 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black tracking-[.08em] text-[#173f2d] sm:text-4xl">{snapshot?.storeName || 'SHOE GALLERY'}</h1>
              <p className="mt-1 max-w-2xl text-xs text-[#68645d] sm:text-sm">{snapshot?.storeAddress || 'No. 17, Gampola Road, Gelioya, Sri Lanka'}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[#22543d]/25 bg-[#22543d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173f2d]"
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}</span>
            </button>
          </div>
          {hasItems && (
            <div className="mt-3 flex items-end justify-between gap-4">
              <h2 className="text-xl font-black uppercase tracking-[.22em] text-[#a44860] sm:text-3xl">Cash Sale</h2>
              {snapshot?.customerName && <p className="text-sm text-[#5f625f]">Customer: <strong>{snapshot.customerName}</strong></p>}
            </div>
          )}
        </header>

        {!hasItems ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#22543d]/15 bg-[#22543d]/5 text-[#22543d]">
              <ShoppingBag size={44} />
            </div>
            <p className="mt-7 text-sm font-bold uppercase tracking-[.35em] text-[#a44860]">Welcome</p>
            <h2 className="mt-3 text-3xl font-black text-[#173f2d] sm:text-5xl">Ready for your purchase</h2>
            <p className="mt-4 text-base text-[#6a6e69] sm:text-xl">Your items will appear here as they are scanned.</p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[41%]" />
                  <col className="w-[14%]" />
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#f4e8e7] text-left text-[11px] uppercase tracking-[.12em] text-[#7d4352] sm:text-sm">
                  <tr>
                    <th className="border-b border-r border-[#c98ea0] px-3 py-3 text-center">No.</th>
                    <th className="border-b border-r border-[#c98ea0] px-3 py-3 text-center">Qty</th>
                    <th className="border-b border-r border-[#c98ea0] px-3 py-3">Description</th>
                    <th className="border-b border-r border-[#c98ea0] px-3 py-3 text-right">Rate</th>
                    <th className="border-b border-r border-[#c98ea0] px-3 py-3 text-right">Discount</th>
                    <th className="border-b border-[#c98ea0] px-3 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-sm sm:text-lg">
                  {snapshot!.items.map((item, index) => (
                    <tr key={`${item.article ?? item.productName}-${item.size}-${item.colour}-${index}`} className="odd:bg-white even:bg-[#fff9f4]">
                      <td className="border-b border-r border-[#d8b8bd] px-3 py-4 text-center font-semibold text-[#8e4a5c]">{index + 1}</td>
                      <td className="border-b border-r border-[#d8b8bd] px-3 py-4 text-center font-bold tabular-nums">{item.quantity}</td>
                      <td className="border-b border-r border-[#d8b8bd] px-3 py-4 font-semibold">
                        <span>{itemDescription(item)}</span>
                        {item.article && <span className="mt-1 block text-xs font-normal text-[#77716a]">Article: {item.article}</span>}
                      </td>
                      <td className="border-b border-r border-[#d8b8bd] px-3 py-4 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                      <td className="border-b border-r border-[#d8b8bd] px-3 py-4 text-right tabular-nums">{item.discount > 0 ? formatCurrency(item.discount) : '0.00'}</td>
                      <td className="border-b border-[#d8b8bd] px-3 py-4 text-right font-bold tabular-nums">{formatCurrency(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="grid shrink-0 border-t-2 border-[#b35f73] bg-[#fffaf0] md:grid-cols-[minmax(220px,.8fr)_minmax(360px,1fr)]">
              <div className="border-b border-[#d8b8bd] px-5 py-4 md:border-b-0 md:border-r sm:px-7">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8e4a5c]">Payment</p>
                <p className="mt-1 text-xl font-bold text-[#173f2d]">{paymentLabels[snapshot!.paymentMethod]}</p>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:text-base">
                  <div><p className="text-[#71746e]">Amount Received</p><p className="font-bold tabular-nums">{formatCurrency(snapshot!.amountReceived)}</p></div>
                  <div><p className="text-[#71746e]">Change Due</p><p className="font-bold tabular-nums text-[#a44860]">{formatCurrency(snapshot!.changeDue)}</p></div>
                </div>
              </div>
              <div className="space-y-1.5 px-5 py-3 text-sm sm:px-7 sm:text-base">
                <div className="flex justify-between gap-5"><span className="text-[#6d706b]">Subtotal</span><span className="font-semibold tabular-nums">{formatCurrency(snapshot!.subtotal)}</span></div>
                {snapshot!.itemDiscount > 0 && <div className="flex justify-between gap-5"><span className="text-[#6d706b]">Item Discount</span><span className="font-semibold tabular-nums">- {formatCurrency(snapshot!.itemDiscount)}</span></div>}
                <div className="flex justify-between gap-5"><span className="text-[#6d706b]">Sale Discount</span><span className="font-semibold tabular-nums">- {formatCurrency(snapshot!.saleDiscount)}</span></div>
                {snapshot!.paymentFee > 0 && <div className="flex justify-between gap-5"><span className="text-[#6d706b]">Card Fee</span><span className="font-semibold tabular-nums">{formatCurrency(snapshot!.paymentFee)}</span></div>}
                <div className="mt-2 flex items-end justify-between gap-5 border-t border-[#c98ea0] pt-2 text-[#173f2d]">
                  <span className="text-lg font-black uppercase tracking-[.08em] sm:text-2xl">Grand Total</span>
                  <span className="text-2xl font-black tabular-nums sm:text-4xl">{formatCurrency(snapshot!.grandTotal)}</span>
                </div>
              </div>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
