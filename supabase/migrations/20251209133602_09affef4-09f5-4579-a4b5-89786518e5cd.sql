-- Fix: Supplier Legal Appeals Public Access Exposure
-- Problem: The policy "Public can verify recursos fornecedor by protocolo" exposes full appeal records
-- Solution: Replace with a secure RPC function that returns only verification status

-- Step 1: Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can verify recursos fornecedor by protocolo" ON public.recursos_fornecedor;

-- Step 2: Create a secure verification function that returns minimal data
CREATE OR REPLACE FUNCTION public.verificar_recurso_fornecedor(p_protocolo text)
RETURNS TABLE (
  existe boolean,
  data_envio date,
  tipo_documento text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true as existe,
    rf.data_envio::date as data_envio,
    'Recurso de Fornecedor'::text as tipo_documento
  FROM public.recursos_fornecedor rf
  WHERE rf.protocolo = p_protocolo
  LIMIT 1;
$$;

-- Grant execute permission to anonymous users for public verification
GRANT EXECUTE ON FUNCTION public.verificar_recurso_fornecedor(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verificar_recurso_fornecedor(text) TO authenticated;