-- Adicionar policy para permitir usuários internos atualizarem cotacao_respostas_fornecedor
CREATE POLICY "Internal users can update cotacao respostas"
ON cotacao_respostas_fornecedor
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
));