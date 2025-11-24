-- Permitir visualização de itens de propostas de seleção para verificação de documentos

CREATE POLICY "Users can view selecao respostas itens"
ON selecao_respostas_itens_fornecedor
FOR SELECT
TO authenticated, anon
USING (true);