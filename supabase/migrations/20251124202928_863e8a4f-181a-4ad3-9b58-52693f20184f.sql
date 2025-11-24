-- Adicionar política RLS para permitir gestores/colaboradores deletarem propostas e itens
-- Política para deletar propostas
DROP POLICY IF EXISTS "Internal users can delete propostas" ON selecao_propostas_fornecedor;
CREATE POLICY "Internal users can delete propostas"
ON selecao_propostas_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Política para deletar itens de propostas
DROP POLICY IF EXISTS "Internal users can delete proposta items" ON selecao_respostas_itens_fornecedor;
CREATE POLICY "Internal users can delete proposta items"
ON selecao_respostas_itens_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);