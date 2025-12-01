-- Permitir que fornecedores vejam cotações onde eles têm proposta enviada
CREATE POLICY "Fornecedores can view cotacoes where they have proposta"
ON cotacoes_precos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN fornecedores f ON f.id = crf.fornecedor_id
    WHERE crf.cotacao_id = cotacoes_precos.id 
    AND f.user_id = auth.uid()
  )
);