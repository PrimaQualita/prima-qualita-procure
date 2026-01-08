-- Remover overload criado anteriormente e padronizar a assinatura (TEXT) para evitar ambiguidade no RPC.

DROP FUNCTION IF EXISTS public.registrar_auditoria_proposta_fornecedor(
  uuid, text, text, numeric, text, text, text
);

CREATE OR REPLACE FUNCTION public.registrar_auditoria_proposta_fornecedor(
  p_entidade_id text,
  p_fornecedor_nome text,
  p_fornecedor_cnpj text,
  p_valor_total numeric,
  p_contrato_gestao text,
  p_numero_processo text,
  p_titulo_cotacao text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
BEGIN
  IF p_entidade_id IS NULL OR btrim(p_entidade_id) = '' THEN
    RAISE EXCEPTION 'p_entidade_id é obrigatório';
  END IF;

  INSERT INTO public.audit_logs (
    acao,
    entidade,
    entidade_id,
    usuario_nome,
    usuario_tipo,
    detalhes
  ) VALUES (
    'criação',
    'Proposta Cotação',
    p_entidade_id,
    COALESCE(NULLIF(p_fornecedor_nome, ''), 'Fornecedor não identificado'),
    'fornecedor',
    jsonb_build_object(
      'contrato_gestao', COALESCE(p_contrato_gestao, ''),
      'numero_processo', COALESCE(p_numero_processo, ''),
      'titulo_cotacao', COALESCE(p_titulo_cotacao, ''),
      'fornecedor', COALESCE(p_fornecedor_nome, ''),
      'cnpj', COALESCE(p_fornecedor_cnpj, ''),
      'valor_total', p_valor_total
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_auditoria_proposta_fornecedor(
  text, text, text, numeric, text, text, text
) TO anon, authenticated;
