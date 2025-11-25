-- Criar função SECURITY DEFINER para atualizar itens de proposta de seleção
-- Esta função permite que fornecedores atualizem seus itens usando o proposta_id como validação
CREATE OR REPLACE FUNCTION public.atualizar_item_proposta_selecao(
  p_item_id uuid,
  p_proposta_id uuid,
  p_valor_unitario numeric,
  p_marca text,
  p_valor_total numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Verificar se o item pertence à proposta informada
  IF NOT EXISTS (
    SELECT 1 FROM selecao_respostas_itens_fornecedor
    WHERE id = p_item_id AND proposta_id = p_proposta_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Item não encontrado ou não pertence à proposta');
  END IF;

  -- Atualizar o item
  UPDATE selecao_respostas_itens_fornecedor
  SET 
    valor_unitario_ofertado = p_valor_unitario,
    marca = p_marca,
    valor_total_item = p_valor_total
  WHERE id = p_item_id AND proposta_id = p_proposta_id;

  RETURN json_build_object('success', true);
END;
$$;

-- Permitir que usuários autenticados e anônimos chamem a função
GRANT EXECUTE ON FUNCTION public.atualizar_item_proposta_selecao TO authenticated, anon;