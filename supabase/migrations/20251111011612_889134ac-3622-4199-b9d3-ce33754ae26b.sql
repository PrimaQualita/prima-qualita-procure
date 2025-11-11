-- Drop the problematic policy
DROP POLICY IF EXISTS "Fornecedores can view itens cotacao" ON itens_cotacao;

-- Recreate the policy correctly without recursion
CREATE POLICY "Fornecedores can view itens cotacao"
ON itens_cotacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cotacao_fornecedor_convites cfc
    JOIN fornecedores f ON f.id = cfc.fornecedor_id
    WHERE cfc.cotacao_id = itens_cotacao.cotacao_id
      AND f.user_id = auth.uid()
  )
);