CREATE OR REPLACE FUNCTION public.limpar_resposta_por_id(p_resposta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF p_resposta_id IS NOT NULL THEN
    DELETE FROM respostas_itens_fornecedor WHERE cotacao_resposta_fornecedor_id = p_resposta_id;
    DELETE FROM anexos_cotacao_fornecedor WHERE cotacao_resposta_fornecedor_id = p_resposta_id;
    DELETE FROM cotacao_respostas_fornecedor WHERE id = p_resposta_id;
  END IF;
END;
$$;