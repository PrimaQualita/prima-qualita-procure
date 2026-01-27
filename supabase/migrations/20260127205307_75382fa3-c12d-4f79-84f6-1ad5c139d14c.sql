-- Criar função RPC para registrar auditoria de proposta de SELEÇÃO via fornecedor (link externo)
-- Similar à função registrar_auditoria_proposta_fornecedor que funciona para cotações

CREATE OR REPLACE FUNCTION public.registrar_auditoria_proposta_selecao_fornecedor(
  p_entidade_id text,
  p_fornecedor_nome text,
  p_fornecedor_cnpj text,
  p_valor_total numeric,
  p_contrato_gestao text,
  p_numero_processo text,
  p_titulo_selecao text,
  p_protocolo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
DECLARE
  v_entidade_uuid uuid;
BEGIN
  -- Converte entidade_id (TEXT) para UUID quando possível
  IF p_entidade_id IS NOT NULL
     AND p_entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entidade_uuid := p_entidade_id::uuid;
  ELSE
    v_entidade_uuid := NULL;
  END IF;

  INSERT INTO public.audit_logs (
    created_at,
    acao,
    entidade,
    entidade_id,
    usuario_nome,
    usuario_tipo,
    detalhes
  ) VALUES (
    now(),
    'criação',
    'Proposta Seleção',
    v_entidade_uuid,
    COALESCE(NULLIF(p_fornecedor_nome, ''), 'Fornecedor não identificado'),
    'fornecedor',
    jsonb_build_object(
      'contrato_gestao', COALESCE(p_contrato_gestao, ''),
      'numero_processo', COALESCE(p_numero_processo, ''),
      'titulo_selecao', COALESCE(p_titulo_selecao, ''),
      'fornecedor', COALESCE(p_fornecedor_nome, ''),
      'cnpj', COALESCE(p_fornecedor_cnpj, ''),
      'valor_total', p_valor_total,
      'protocolo', COALESCE(p_protocolo, '')
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Não bloquear o envio da proposta por falha de auditoria
    RAISE WARNING 'Erro ao registrar auditoria de proposta de seleção (fornecedor): %', SQLERRM;
    RETURN;
END;
$function$;