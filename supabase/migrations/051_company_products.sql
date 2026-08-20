-- Add percentage-priced company products without changing normal product pricing.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS company_percentage NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS company_selling_price NUMERIC(12, 2);

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS company_percentage NUMERIC(5, 2);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check,
  DROP CONSTRAINT IF EXISTS products_company_percentage_check,
  DROP CONSTRAINT IF EXISTS products_company_selling_price_check,
  DROP CONSTRAINT IF EXISTS products_company_pricing_required_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check CHECK (product_type IN ('normal', 'company')),
  ADD CONSTRAINT products_company_percentage_check CHECK (company_percentage IS NULL OR company_percentage BETWEEN 0 AND 100),
  ADD CONSTRAINT products_company_selling_price_check CHECK (company_selling_price IS NULL OR company_selling_price > 0),
  ADD CONSTRAINT products_company_pricing_required_check CHECK (
    product_type <> 'company'
    OR (company_percentage IS NOT NULL AND company_selling_price IS NOT NULL)
  );

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_company_percentage_check;

ALTER TABLE public.product_variants
  ADD CONSTRAINT product_variants_company_percentage_check
    CHECK (company_percentage IS NULL OR company_percentage BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.calculate_company_cost(p_selling_price NUMERIC, p_percentage NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT round(p_selling_price - (p_selling_price * p_percentage / 100), 2);
$$;

CREATE OR REPLACE FUNCTION public.apply_company_variant_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_product RECORD;
  effective_percentage NUMERIC;
BEGIN
  SELECT product_type, company_percentage, company_selling_price
  INTO parent_product
  FROM public.products
  WHERE id = NEW.product_id;

  IF parent_product.product_type = 'company' THEN
    NEW.selling_price := COALESCE(NEW.selling_price, parent_product.company_selling_price);
    effective_percentage := COALESCE(NEW.company_percentage, parent_product.company_percentage);

    IF NEW.selling_price IS NULL OR NEW.selling_price <= 0 THEN
      RAISE EXCEPTION 'Selling price must be greater than zero for a company product';
    END IF;

    NEW.cost_price := public.calculate_company_cost(NEW.selling_price, effective_percentage);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_variants_apply_company_pricing ON public.product_variants;
CREATE TRIGGER product_variants_apply_company_pricing
BEFORE INSERT OR UPDATE OF product_id, selling_price, company_percentage
ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.apply_company_variant_pricing();

CREATE OR REPLACE FUNCTION public.refresh_inherited_company_variant_costs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.product_type = 'company'
     AND (
       OLD.product_type IS DISTINCT FROM NEW.product_type
       OR OLD.company_percentage IS DISTINCT FROM NEW.company_percentage
     ) THEN
    UPDATE public.product_variants
    SET cost_price = public.calculate_company_cost(selling_price, NEW.company_percentage)
    WHERE product_id = NEW.id
      AND company_percentage IS NULL
      AND selling_price IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_refresh_inherited_company_costs ON public.products;
CREATE TRIGGER products_refresh_inherited_company_costs
AFTER UPDATE OF product_type, company_percentage
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.refresh_inherited_company_variant_costs();
