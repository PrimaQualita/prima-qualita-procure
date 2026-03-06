CREATE OR REPLACE FUNCTION public.limpar_resposta_existente_fornecedor(p_cotacao_id uuid, p_fornecedor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_resposta_id uuid;
BEGIN
  SELECT id INTO v_resposta_id
  FROM cotacao_respostas_fornecedor
  WHERE cotacao_id = p_cotacao_id AND fornecedor_id = p_fornecedor_id;
  
  IF v_resposta_id IS NOT NULL THEN
    DELETE FROM respostas_itens_fornecedor WHERE cotacao_resposta_fornecedor_id = v_resposta_id;
    DELETE FROM anexos_cotacao_fornecedor WHERE cotacao_resposta_fornecedor_id = v_resposta_id;
    DELETE FROM cotacao_respostas_fornecedor WHERE id = v_resposta_id;
  END IF;
END;
$$;