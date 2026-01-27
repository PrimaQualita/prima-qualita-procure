-- Corrige auditoria de upload de documento adicional por fornecedor:
-- 1) desliga RLS dentro da função (row_security=off) para permitir INSERT em audit_logs
-- 2) adiciona campos opcionais (nome_arquivo, url_arquivo, responsavel_email) para enriquecer o log

DROP FUNCTION IF EXISTS public.registrar_auditoria_documento_adicional_fornecedor(
  text, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.registrar_auditoria_documento_adicional_fornecedor(
  p_entidade_id TEXT,
  p_fornecedor_nome TEXT,
  p_nome_documento TEXT,
  p_numero_processo TEXT,
  p_contrato_gestao TEXT,
  p_titulo_cotacao TEXT DEFAULT NULL,
  p_titulo_selecao TEXT DEFAULT NULL,
  p_acao TEXT DEFAULT 'criação',
  p_nome_arquivo TEXT DEFAULT NULL,
  p_url_arquivo TEXT DEFAULT NULL,
  p_responsavel_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    created_at,
    usuario_id,
    usuario_nome,
    usuario_tipo,
    acao,
    entidade,
    entidade_id,
    detalhes
  ) VALUES (
    now(),
    NULL,
    COALESCE(NULLIF(p_responsavel_email, ''), NULLIF(p_fornecedor_nome, ''), 'Fornecedor não identificado'),
    'fornecedor',
    p_acao,
    'documentos_finalizacao_fornecedor',
    CASE WHEN p_entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         THEN p_entidade_id
         ELSE NULL
    END,
    jsonb_build_object(
      'nome_documento', p_nome_documento,
      'nome_arquivo', p_nome_arquivo,
      'url_arquivo', p_url_arquivo,
      'fornecedor', p_fornecedor_nome,
      'responsavel_email', p_responsavel_email,
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
  text, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;