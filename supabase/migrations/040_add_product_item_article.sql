ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_article TEXT;

CREATE INDEX IF NOT EXISTS products_item_article_search_idx
  ON public.products (lower(item_article));
