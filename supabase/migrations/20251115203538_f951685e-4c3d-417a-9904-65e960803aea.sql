-- Criar política RLS para permitir que qualquer um insira itens de resposta para cotações abertas
CREATE POLICY "Anyone can create respostas itens for open cotacoes"
ON public.respostas_itens_fornecedor
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = cotacao_resposta_fornecedor_id
      AND cp.status_cotacao = 'em_aberto'::status_cotacao
      AND cp.data_limite_resposta > now()
  )
);

-- Criar política RLS para permitir que qualquer um atualize itens de resposta para cotações abertas
CREATE POLICY "Anyone can update respostas itens for open cotacoes"
ON public.respostas_itens_fornecedor
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = cotacao_resposta_fornecedor_id
      AND cp.status_cotacao = 'em_aberto'::status_cotacao
      AND cp.data_limite_resposta > now()
  )
);