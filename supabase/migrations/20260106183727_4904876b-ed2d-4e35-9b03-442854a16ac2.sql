-- RPC para buscar a intenção de recurso usando apenas o código de acesso (sem depender de SELECT com RLS)
CREATE OR REPLACE FUNCTION public.get_intencao_recurso_por_codigo(
  p_selecao_id uuid,
  p_codigo_acesso text
)
RETURNS TABLE(
  id uuid,
  fornecedor_id uuid,
  selecao_id uuid,
  deseja_recorrer boolean,
  motivo_intencao text,
  data_intencao timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH fp AS (
    SELECT spf.fornecedor_id
    FROM public.selecao_propostas_fornecedor spf
    WHERE spf.selecao_id = p_selecao_id
      AND spf.codigo_acesso = p_codigo_acesso
    ORDER BY spf.created_at DESC
    LIMIT 1
  )
  SELECT i.id,
         i.fornecedor_id,
         i.selecao_id,
         i.deseja_recorrer,
         i.motivo_intencao,
         i.data_intencao,
         i.created_at
  FROM public.intencoes_recurso_selecao i
  JOIN fp ON fp.fornecedor_id = i.fornecedor_id
  WHERE i.selecao_id = p_selecao_id
  ORDER BY i.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_intencao_recurso_por_codigo(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_intencao_recurso_por_codigo(uuid, text) TO authenticated;
