import type { StoreSettings } from '../../types';

export function ReceiptFooter({store}:{store:StoreSettings|null}) {
  return <footer className="receipt-section receipt-footer"><strong>THANK YOU</strong>{store?.receipt_show_return_policy!==false&&<p>Only returns within 7 days &amp; no cash returns</p>}{store?.receipt_footer&&<p>{store.receipt_footer}</p>}</footer>;
}
