-- Função RPC para registrar auditoria de recurso enviado por fornecedor (usuário externo)
CREATE OR REPLACE FUNCTION public.registrar_auditoria_recurso_fornecedor(
  p_entidade_id text,
  p_fornecedor_nome text,
  p_fornecedor_cnpj text,
  p_numero_processo text,
  p_contrato_gestao text,
  p_titulo_cotacao text,
  p_motivo_rejeicao text,
  p_protocolo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_entidade_uuid UUID;
BEGIN
  -- Validar e converter entidade_id para UUID
  IF p_entidade_id IS NOT NULL AND p_entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entidade_uuid := p_entidade_id::uuid;
  ELSE
    v_entidade_uuid := NULL;
  END IF;

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
    COALESCE(NULLIF(p_fornecedor_nome, ''), 'Fornecedor não identificado'),
    'fornecedor',
    'criação',
    'Recurso Cotação',
    v_entidade_uuid,
    jsonb_build_object(
      'tipo', 'Recurso de Rejeição - Envio Fornecedor',
      'protocolo', COALESCE(p_protocolo, ''),
      'fornecedor', p_fornecedor_nome,
      'cnpj', p_fornecedor_cnpj,
      'numero_processo', p_numero_processo,
      'contrato_gestao', p_contrato_gestao,
      'titulo_cotacao', p_titulo_cotacao,
      'motivo_rejeicao', p_motivo_rejeicao
    )
  );

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erro ao registrar auditoria de recurso fornecedor: %', SQLERRM;
    RETURN FALSE;
END;
$$;