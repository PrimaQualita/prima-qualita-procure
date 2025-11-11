-- Permitir SELECT público em cotacao_respostas_fornecedor para verificação de duplicatas
CREATE POLICY "Public can check existing respostas"
ON cotacao_respostas_fornecedor
FOR SELECT
TO public
USING (true);