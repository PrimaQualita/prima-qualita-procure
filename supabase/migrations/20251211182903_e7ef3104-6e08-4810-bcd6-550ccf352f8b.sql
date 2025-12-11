-- Atualizar função para aceitar parâmetro indicando se foi aceitação ou recusa
CREATE OR REPLACE FUNCTION public.fechar_negociacao_fornecedor(
  p_selecao_id uuid, 
  p_numero_item integer, 
  p_fornecedor_id uuid, 
  p_codigo_acesso text,
  p_foi_aceito boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposta_valida boolean;
  v_item_em_negociacao boolean;
  v_mensagem text;
BEGIN
  -- Verificar se o código de acesso corresponde ao fornecedor e seleção
  SELECT EXISTS (
    SELECT 1 FROM selecao_propostas_fornecedor
    WHERE selecao_id = p_selecao_id
    AND fornecedor_id = p_fornecedor_id
    AND codigo_acesso = p_codigo_acesso
  ) INTO v_proposta_valida;

  IF NOT v_proposta_valida THEN
    RETURN json_build_object('success', false, 'error', 'Código de acesso inválido ou não corresponde ao fornecedor');
  END IF;

  -- Verificar se o item está em negociação com este fornecedor
  SELECT EXISTS (
    SELECT 1 FROM itens_abertos_lances
    WHERE selecao_id = p_selecao_id
    AND numero_item = p_numero_item
    AND em_negociacao = true
    AND fornecedor_negociacao_id = p_fornecedor_id
  ) INTO v_item_em_negociacao;

  IF NOT v_item_em_negociacao THEN
    RETURN json_build_object('success', false, 'error', 'Item não está em negociação com este fornecedor');
  END IF;

  -- Fechar a negociação
  UPDATE itens_abertos_lances
  SET 
    em_negociacao = false,
    negociacao_concluida = true,
    aberto = false,
    data_fechamento = now()
  WHERE selecao_id = p_selecao_id
  AND numero_item = p_numero_item;

  -- Definir mensagem baseada no tipo de fechamento
  IF p_foi_aceito THEN
    v_mensagem := '✅ Fornecedor aceitou a negociação e melhorou a oferta.';
  ELSE
    v_mensagem := '❌ Fornecedor recusou a negociação e encerrou o item.';
  END IF;

  -- Registrar mensagem no chat
  INSERT INTO mensagens_negociacao (
    selecao_id,
    fornecedor_id,
    numero_item,
    mensagem,
    tipo_remetente
  ) VALUES (
    p_selecao_id,
    p_fornecedor_id,
    p_numero_item,
    v_mensagem,
    'fornecedor'
  );

  RETURN json_build_object('success', true);
END;
$function$;

-- Manter permissões
GRANT EXECUTE ON FUNCTION public.fechar_negociacao_fornecedor(uuid, integer, uuid, text, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.fechar_negociacao_fornecedor(uuid, integer, uuid, text, boolean) TO authenticated;