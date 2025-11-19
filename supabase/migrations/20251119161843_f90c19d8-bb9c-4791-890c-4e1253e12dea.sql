
-- Remover TODAS as políticas existentes e criar novas mais robustas
DROP POLICY IF EXISTS "fornecedores_select_own_docs" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "fornecedores_insert_own_docs" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "fornecedores_update_own_docs" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "internal_users_select_all_docs" ON documentos_finalizacao_fornecedor;

-- Política SELECT para fornecedores (seus documentos)
CREATE POLICY "fornecedores_can_select_their_docs"
ON documentos_finalizacao_fornecedor
FOR SELECT
TO authenticated
USING (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Política INSERT para fornecedores (seus documentos)
CREATE POLICY "fornecedores_can_insert_their_docs"
ON documentos_finalizacao_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Política UPDATE para fornecedores (seus documentos)
CREATE POLICY "fornecedores_can_update_their_docs"
ON documentos_finalizacao_fornecedor
FOR UPDATE
TO authenticated
USING (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Política SELECT para usuários internos (todos os documentos)
CREATE POLICY "internal_users_can_select_all_docs"
ON documentos_finalizacao_fornecedor
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('gestor', 'colaborador', 'compliance')
  )
);
