-- Incluir protocolo de certificação na auditoria de Proposta Cotação (link externo)
-- A resposta (cotacao_respostas_fornecedor) possui o campo "protocolo"; vamos buscá-lo e gravar em audit_logs.detalhes.

DROP FUNCTION IF EXISTS public.registrar_auditoria_proposta_fornecedor(
  text,
  text,
  text,
  numeric,
  text,
  text,
  text
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
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_entidade_uuid uuid;
  v_protocolo text;
BEGIN
  -- Converte entidade_id (TEXT) para UUID quando possível
  IF p_entidade_id IS NOT NULL
     AND p_entidade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_entidade_uuid := p_entidade_id::uuid;
  ELSE
    v_entidade_uuid := NULL;
  END IF;

  -- Buscar protocolo de certificação da resposta (quando existir)
  IF v_entidade_uuid IS NOT NULL THEN
    SELECT crf.protocolo
      INTO v_protocolo
    FROM public.cotacao_respostas_fornecedor crf
    WHERE crf.id = v_entidade_uuid;
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
    'Proposta Cotação',
    v_entidade_uuid,
    COALESCE(NULLIF(p_fornecedor_nome, ''), 'Fornecedor não identificado'),
    'fornecedor',
    jsonb_build_object(
      'contrato_gestao', COALESCE(p_contrato_gestao, ''),
      'numero_processo', COALESCE(p_numero_processo, ''),
      'titulo_cotacao', COALESCE(p_titulo_cotacao, ''),
      'fornecedor', COALESCE(p_fornecedor_nome, ''),
      'cnpj', COALESCE(p_fornecedor_cnpj, ''),
      'valor_total', p_valor_total,
      'protocolo', COALESCE(v_protocolo, '')
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Não bloquear o envio da proposta por falha de auditoria
    RAISE WARNING 'Erro ao registrar auditoria de proposta (fornecedor): %', SQLERRM;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_auditoria_proposta_fornecedor(
  text,
  text,
  text,
  numeric,
  text,
  text,
  text
) TO anon, authenticated;