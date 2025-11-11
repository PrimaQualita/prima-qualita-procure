-- Permitir acesso público aos itens de cotações em aberto (para fornecedores não cadastrados)
CREATE POLICY "Public can view itens of open cotacoes"
ON itens_cotacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cotacoes_precos
    WHERE cotacoes_precos.id = itens_cotacao.cotacao_id
      AND cotacoes_precos.status_cotacao = 'em_aberto'
      AND cotacoes_precos.data_limite_resposta > NOW()
  )
);

-- Permitir acesso público aos lotes de cotações em aberto
CREATE POLICY "Public can view lotes of open cotacoes"
ON lotes_cotacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cotacoes_precos
    WHERE cotacoes_precos.id = lotes_cotacao.cotacao_id
      AND cotacoes_precos.status_cotacao = 'em_aberto'
      AND cotacoes_precos.data_limite_resposta > NOW()
  )
);

-- Permitir acesso público às cotações em aberto
CREATE POLICY "Public can view open cotacoes"
ON cotacoes_precos
FOR SELECT
USING (
  status_cotacao = 'em_aberto'
  AND data_limite_resposta > NOW()
);