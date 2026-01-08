-- Função RPC para registrar auditoria de envio de proposta de cotação por fornecedor
-- Usa SECURITY DEFINER para permitir inserção mesmo com usuário anônimo
CREATE OR REPLACE FUNCTION public.registrar_auditoria_proposta_fornecedor(
  p_entidade_id TEXT,
  p_fornecedor_nome TEXT,
  p_fornecedor_cnpj TEXT,
  p_valor_total NUMERIC,
  p_contrato_gestao TEXT,
  p_numero_processo TEXT,
  p_titulo_cotacao TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (
    acao,
    entidade,
    entidade_id,
    usuario_nome,
    usuario_tipo,
    detalhes
  ) VALUES (
    'criação',
    'Proposta Cotação Fornecedor',
    p_entidade_id,
    p_fornecedor_nome,
    'fornecedor',
    jsonb_build_object(
      'contrato_gestao', p_contrato_gestao,
      'numero_processo', p_numero_processo,
      'titulo_cotacao', p_titulo_cotacao,
      'fornecedor', p_fornecedor_nome,
      'cnpj', p_fornecedor_cnpj,
      'valor_total', p_valor_total
    )
  );
END;
$$;