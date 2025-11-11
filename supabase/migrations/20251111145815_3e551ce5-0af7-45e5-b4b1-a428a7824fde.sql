-- Adicionar políticas RLS para permitir exclusão de respostas de cotação por usuários internos

-- Política para excluir respostas de fornecedor
CREATE POLICY "Internal users can delete cotacao respostas"
ON cotacao_respostas_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Política para excluir itens de resposta
CREATE POLICY "Internal users can delete respostas itens"
ON respostas_itens_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);