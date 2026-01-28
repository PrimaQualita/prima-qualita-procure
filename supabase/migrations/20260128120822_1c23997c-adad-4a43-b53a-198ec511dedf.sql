-- RPC para registrar auditoria de exclusão de recurso de seleção pelo fornecedor
CREATE OR REPLACE FUNCTION public.registrar_auditoria_exclusao_recurso_selecao_fornecedor(
  p_entidade_id text,
  p_fornecedor_nome text,
  p_fornecedor_cnpj text,
  p_numero_processo text,
  p_numero_selecao text,
  p_titulo_selecao text,
  p_contrato_gestao text,
  p_protocolo_recurso text DEFAULT NULL,
  p_motivo_inabilitacao text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_entidade_uuid UUID;
BEGIN
  -- Validar e converter entidade_id para UUID quando possível
  IF p_entidade_id IS NOT NULL 
     AND p_entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
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
    'exclusão',
    'Recurso Inabilitação Seleção',
    v_entidade_uuid,
    jsonb_build_object(
      'fornecedor', p_fornecedor_nome,
      'cnpj', p_fornecedor_cnpj,
      'numero_processo', p_numero_processo,
      'numero_selecao', p_numero_selecao,
      'titulo_selecao', p_titulo_selecao,
      'contrato_gestao', p_contrato_gestao,
      'protocolo_recurso', p_protocolo_recurso,
      'motivo_inabilitacao', p_motivo_inabilitacao,
      'tipo', 'Exclusão de Recurso pelo Fornecedor'
    )
  );

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Erro ao registrar auditoria de exclusão de recurso: %', SQLERRM;
    RETURN FALSE;
END;
$function$;