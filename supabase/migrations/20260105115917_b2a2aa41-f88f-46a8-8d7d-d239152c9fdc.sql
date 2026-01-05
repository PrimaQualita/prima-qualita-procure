-- Funções seguras para permitir leitura (sem login) a partir do código de acesso do fornecedor
-- Motivação: a tela pública do fornecedor usa `codigo_acesso` e não tem sessão; RLS impede SELECT direto.

CREATE OR REPLACE FUNCTION public.get_itens_abertos_lances_por_codigo(
  p_selecao_id uuid,
  p_codigo_acesso text
)
RETURNS TABLE (
  numero_item integer,
  aberto boolean,
  iniciando_fechamento boolean,
  data_inicio_fechamento timestamptz,
  segundos_para_fechar integer,
  em_negociacao boolean,
  negociacao_concluida boolean,
  nao_negociar boolean,
  negociacao_para_mim boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fornecedor AS (
    SELECT spf.fornecedor_id
    FROM public.selecao_propostas_fornecedor spf
    WHERE spf.selecao_id = p_selecao_id
      AND spf.codigo_acesso = p_codigo_acesso
    LIMIT 1
  )
  SELECT
    ial.numero_item,
    ial.aberto,
    ial.iniciando_fechamento,
    ial.data_inicio_fechamento,
    ial.segundos_para_fechar,
    COALESCE(ial.em_negociacao, false) AS em_negociacao,
    COALESCE(ial.negociacao_concluida, false) AS negociacao_concluida,
    COALESCE(ial.nao_negociar, false) AS nao_negociar,
    (ial.fornecedor_negociacao_id = (SELECT fornecedor_id FROM fornecedor)) AS negociacao_para_mim
  FROM public.itens_abertos_lances ial
  WHERE ial.selecao_id = p_selecao_id
    AND EXISTS (SELECT 1 FROM fornecedor);
$$;

CREATE OR REPLACE FUNCTION public.get_lances_por_codigo(
  p_selecao_id uuid,
  p_codigo_acesso text
)
RETURNS TABLE (
  id uuid,
  selecao_id uuid,
  fornecedor_id uuid,
  numero_item integer,
  valor_lance numeric,
  tipo_lance text,
  data_hora_lance timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Valida o código de acesso (deve existir uma proposta para o fornecedor nesta seleção)
  WITH fornecedor AS (
    SELECT spf.fornecedor_id
    FROM public.selecao_propostas_fornecedor spf
    WHERE spf.selecao_id = p_selecao_id
      AND spf.codigo_acesso = p_codigo_acesso
    LIMIT 1
  )
  SELECT
    lf.id,
    lf.selecao_id,
    lf.fornecedor_id,
    lf.numero_item,
    lf.valor_lance,
    lf.tipo_lance,
    lf.data_hora_lance,
    lf.created_at
  FROM public.lances_fornecedores lf
  WHERE lf.selecao_id = p_selecao_id
    AND EXISTS (SELECT 1 FROM fornecedor)
  ORDER BY lf.valor_lance ASC, lf.data_hora_lance ASC;
$$;

-- Restringir execução explicitamente
REVOKE ALL ON FUNCTION public.get_itens_abertos_lances_por_codigo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_itens_abertos_lances_por_codigo(uuid, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_lances_por_codigo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lances_por_codigo(uuid, text) TO anon, authenticated;
