-- Corrigir auditoria de proposta via link externo (fornecedor)
-- Problema: audit_logs.entidade_id é UUID, mas a função recebia TEXT e inseria sem cast,
-- causando erro e o log não era gravado.

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
      'valor_total', p_valor_total
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