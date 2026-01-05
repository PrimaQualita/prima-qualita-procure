-- Permite que fornecedor (link público via codigo_acesso) envie lance sem sessão
-- A função valida participação + estado do item antes de inserir.

CREATE OR REPLACE FUNCTION public.inserir_lance_por_codigo(
  p_selecao_id uuid,
  p_codigo_acesso text,
  p_numero_item integer,
  p_valor_lance numeric,
  p_tipo_lance text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fornecedor_id uuid;
  v_item record;
BEGIN
  -- Validar código de acesso e recuperar fornecedor
  SELECT spf.fornecedor_id
    INTO v_fornecedor_id
  FROM public.selecao_propostas_fornecedor spf
  WHERE spf.selecao_id = p_selecao_id
    AND spf.codigo_acesso = p_codigo_acesso
  LIMIT 1;

  IF v_fornecedor_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Código de acesso inválido');
  END IF;

  IF p_valor_lance IS NULL OR p_valor_lance <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Valor do lance inválido');
  END IF;

  IF p_tipo_lance IS NULL OR p_tipo_lance NOT IN ('lance', 'negociacao') THEN
    RETURN json_build_object('success', false, 'error', 'Tipo de lance inválido');
  END IF;

  -- Validar item
  SELECT *
    INTO v_item
  FROM public.itens_abertos_lances
  WHERE selecao_id = p_selecao_id
    AND numero_item = p_numero_item
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Item não encontrado');
  END IF;

  -- Regras por tipo
  IF p_tipo_lance = 'lance' THEN
    IF v_item.aberto IS DISTINCT FROM true THEN
      RETURN json_build_object('success', false, 'error', 'Item não está aberto para lances');
    END IF;
  ELSE
    IF COALESCE(v_item.em_negociacao, false) IS DISTINCT FROM true THEN
      RETURN json_build_object('success', false, 'error', 'Item não está em negociação');
    END IF;

    IF v_item.fornecedor_negociacao_id IS DISTINCT FROM v_fornecedor_id THEN
      RETURN json_build_object('success', false, 'error', 'Negociação não é para este fornecedor');
    END IF;
  END IF;

  -- Inserir lance
  INSERT INTO public.lances_fornecedores (
    selecao_id,
    fornecedor_id,
    numero_item,
    valor_lance,
    tipo_lance,
    data_hora_lance
  ) VALUES (
    p_selecao_id,
    v_fornecedor_id,
    p_numero_item,
    p_valor_lance,
    p_tipo_lance,
    now()
  );

  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.inserir_lance_por_codigo(uuid, text, integer, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inserir_lance_por_codigo(uuid, text, integer, numeric, text) TO anon, authenticated;
