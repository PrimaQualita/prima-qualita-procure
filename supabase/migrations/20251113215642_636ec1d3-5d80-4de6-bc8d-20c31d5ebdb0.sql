-- Permitir inserção pública de anexos de cotação para propostas
CREATE POLICY "Anyone can create anexos for open cotacoes"
ON anexos_cotacao_fornecedor
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = anexos_cotacao_fornecedor.cotacao_resposta_fornecedor_id
    AND cp.status_cotacao = 'em_aberto'::status_cotacao
    AND cp.data_limite_resposta > now()
  )
);