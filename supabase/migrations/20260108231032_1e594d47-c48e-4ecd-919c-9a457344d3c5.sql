-- Fix: Postgres não aceita múltiplos parâmetros no mesmo SET com vírgula.
-- Recria a função com row_security desativado para permitir inserir em audit_logs mesmo com usuário anônimo.

CREATE OR REPLACE FUNCTION public.registrar_auditoria_proposta_fornecedor(
  p_entidade_id uuid,
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
  IF p_entidade_id IS NULL THEN
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
    p_entidade_id::text,
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
  uuid, text, text, numeric, text, text, text
) TO anon, authenticated;
