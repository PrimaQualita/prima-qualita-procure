-- Função RPC para registrar auditoria de upload de documento adicional por fornecedor
-- Usa SECURITY DEFINER para permitir inserção mesmo com usuário autenticado como fornecedor
CREATE OR REPLACE FUNCTION public.registrar_auditoria_documento_adicional_fornecedor(
  p_entidade_id TEXT,
  p_fornecedor_nome TEXT,
  p_nome_documento TEXT,
  p_numero_processo TEXT,
  p_contrato_gestao TEXT,
  p_titulo_cotacao TEXT DEFAULT NULL,
  p_titulo_selecao TEXT DEFAULT NULL,
  p_acao TEXT DEFAULT 'criação'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    usuario_id,
    usuario_nome,
    usuario_tipo,
    acao,
    entidade,
    entidade_id,
    detalhes
  ) VALUES (
    NULL,
    p_fornecedor_nome,
    'fornecedor',
    p_acao,
    'documentos_finalizacao_fornecedor',
    CASE WHEN p_entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' 
         THEN p_entidade_id 
         ELSE NULL 
    END,
    jsonb_build_object(
      'nome_documento', p_nome_documento,
      'fornecedor', p_fornecedor_nome,
      'numero_processo', p_numero_processo,
      'contrato_gestao', p_contrato_gestao,
      'titulo_cotacao', p_titulo_cotacao,
      'titulo_selecao', p_titulo_selecao,
      'tipo', 'Documento Adicional - Upload Fornecedor'
    )
  );
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Erro ao registrar auditoria de documento adicional: %', SQLERRM;
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_auditoria_documento_adicional_fornecedor(
  text, text, text, text, text, text, text, text
) TO anon, authenticated;