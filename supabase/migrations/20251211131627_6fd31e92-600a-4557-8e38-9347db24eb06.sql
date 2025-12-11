-- Adicionar política para permitir inserção pública de respostas de itens em cotações abertas
-- A política existente faz verificações que falham para usuários anônimos

CREATE POLICY "Anyone can insert respostas itens for open cotacoes"
ON public.respostas_itens_fornecedor
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);