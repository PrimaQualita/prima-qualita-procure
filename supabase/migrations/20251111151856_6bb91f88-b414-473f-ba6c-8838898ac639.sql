-- Permitir UPDATE de respostas de cotação para cotações abertas
CREATE POLICY "Anyone can update cotacao respostas for open cotacoes"
ON cotacao_respostas_fornecedor
FOR UPDATE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM cotacoes_precos
    WHERE cotacoes_precos.id = cotacao_respostas_fornecedor.cotacao_id
    AND cotacoes_precos.status_cotacao = 'em_aberto'
    AND cotacoes_precos.data_limite_resposta > now()
  )
);

-- Permitir DELETE de respostas de cotação para cotações abertas (para sobrescrever)
CREATE POLICY "Anyone can delete own cotacao respostas for open cotacoes"
ON cotacao_respostas_fornecedor
FOR DELETE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM cotacoes_precos
    WHERE cotacoes_precos.id = cotacao_respostas_fornecedor.cotacao_id
    AND cotacoes_precos.status_cotacao = 'em_aberto'
    AND cotacoes_precos.data_limite_resposta > now()
  )
);

-- Permitir DELETE de itens de resposta para permitir sobrescrita
CREATE POLICY "Anyone can delete respostas itens for open cotacoes"
ON respostas_itens_fornecedor
FOR DELETE
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);