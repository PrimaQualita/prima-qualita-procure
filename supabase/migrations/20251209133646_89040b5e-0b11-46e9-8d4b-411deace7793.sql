-- Update the verification function to include non-sensitive data needed for verification display
-- Includes URL (user already has document with protocol), but NOT legal arguments/motivo_recurso

DROP FUNCTION IF EXISTS public.verificar_recurso_fornecedor(text);

CREATE OR REPLACE FUNCTION public.verificar_recurso_fornecedor(p_protocolo text)
RETURNS TABLE (
  existe boolean,
  data_envio timestamp with time zone,
  tipo_documento text,
  url_arquivo text,
  nome_arquivo text,
  fornecedor_razao_social text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    true as existe,
    rf.data_envio,
    'Recurso de Fornecedor'::text as tipo_documento,
    rf.url_arquivo,
    rf.nome_arquivo,
    f.razao_social as fornecedor_razao_social
  FROM public.recursos_fornecedor rf
  LEFT JOIN public.fornecedores f ON f.id = rf.fornecedor_id
  WHERE rf.protocolo = p_protocolo
  LIMIT 1;
$$;

-- Grant execute permission to anonymous users for public verification
GRANT EXECUTE ON FUNCTION public.verificar_recurso_fornecedor(text) TO anon;
GRANT EXECUTE ON FUNCTION public.verificar_recurso_fornecedor(text) TO authenticated;