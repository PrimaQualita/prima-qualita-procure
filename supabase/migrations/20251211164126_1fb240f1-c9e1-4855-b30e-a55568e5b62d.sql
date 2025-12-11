
-- Permitir acesso público a itens de cotação relacionados a seleções de fornecedores
CREATE POLICY "Public can view itens for selecao participation"
ON public.itens_cotacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM selecoes_fornecedores sf
    WHERE sf.cotacao_relacionada_id = itens_cotacao.cotacao_id
  )
);

-- Permitir acesso público a planilhas consolidadas relacionadas a seleções de fornecedores
CREATE POLICY "Public can view planilhas for selecao participation"
ON public.planilhas_consolidadas
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM selecoes_fornecedores sf
    WHERE sf.cotacao_relacionada_id = planilhas_consolidadas.cotacao_id
  )
);
