-- Run this file by itself. It contains no CTE or relation named "rows".
CREATE OR REPLACE FUNCTION public.get_sales_report_payments(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
  WITH eligible_sales AS (
    SELECT DISTINCT item.sale_id
    FROM public.sales_report_item_rows(p_filters) item
  ),
  payment_dataset AS (
    SELECT
      payment.id,
      payment.sale_id,
      sale.invoice_number,
      sale.created_at AS sale_date,
      coalesce(customer.name,'Walk-in Customer') AS customer_name,
      payment.payment_method,
      payment.amount,
      payment.reference_number,
      coalesce(receiver.full_name,receiver.email,'Unknown') AS received_by,
      payment.payment_date,
      payment.notes
    FROM public.sale_payments payment
    JOIN eligible_sales eligible ON eligible.sale_id=payment.sale_id
    JOIN public.sales sale ON sale.id=payment.sale_id
    LEFT JOIN public.customers customer ON customer.id=sale.customer_id
    LEFT JOIN public.profiles receiver ON receiver.id=payment.received_by
    WHERE coalesce(p_filters->>'paymentMethod','')=''
       OR payment.payment_method=p_filters->>'paymentMethod'
  ),
  payment_page AS (
    SELECT payment.*
    FROM payment_dataset payment
    ORDER BY
      CASE WHEN p_sort='oldest' THEN payment.payment_date END ASC,
      CASE WHEN p_sort<>'oldest' THEN payment.payment_date END DESC,
      payment.id DESC
    LIMIT least(greatest(p_page_size,1),10000)
    OFFSET (greatest(p_page,1)-1)*least(greatest(p_page_size,1),10000)
  )
  SELECT jsonb_build_object(
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(payment)) FROM payment_page payment),'[]'::jsonb),
    'total',(SELECT count(*) FROM payment_dataset)
  );
$$;

REVOKE ALL ON FUNCTION public.get_sales_report_payments(jsonb,integer,integer,text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_sales_report_payments(jsonb,integer,integer,text) TO authenticated;
