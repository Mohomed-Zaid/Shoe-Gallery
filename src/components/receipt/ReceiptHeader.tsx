import type { StoreSettings } from '../../types';

export function ReceiptHeader({store}:{store:StoreSettings|null}) {
  return <header className="receipt-header"><h1>{store?.store_name||'SHOE GALLERY'}</h1><p>{store?.address||<>No17, Gampola Road,<br/>Gelioya, Sri Lanka</>}</p>{store?.phone&&<p>Tel: {store.phone}</p>}</header>;
}
