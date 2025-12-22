-- Atualizar função para incluir percentual_desconto
CREATE OR REPLACE FUNCTION public.inserir_respostas_itens(
  p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_item jsonb;
BEGIN
  -- Inserir cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO respostas_itens_fornecedor (
      cotacao_resposta_fornecedor_id,
      item_cotacao_id,
      valor_unitario_ofertado,
      percentual_desconto,
      marca
    ) VALUES (
      (v_item->>'cotacao_resposta_fornecedor_id')::uuid,
      (v_item->>'item_cotacao_id')::uuid,
      (v_item->>'valor_unitario_ofertado')::numeric,
      (v_item->>'percentual_desconto')::numeric,
      v_item->>'marca'
    );
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_itens));
END;
$$;