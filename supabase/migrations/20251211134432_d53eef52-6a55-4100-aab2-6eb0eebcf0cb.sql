-- Adicionar política para permitir SELECT público em respostas_itens_fornecedor para cotações abertas
CREATE POLICY "Public can view respostas itens for open cotacoes"
ON public.respostas_itens_fornecedor
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);