-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Fornecedores podem inserir seus próprios documentos de finalização" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Fornecedores podem ver seus próprios documentos de finalização" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Usuários internos podem ver documentos de finalização" ON documentos_finalizacao_fornecedor;

-- Permitir que fornecedores autenticados façam INSERT de documentos de finalização
CREATE POLICY "Fornecedores podem inserir seus próprios documentos de finalização"
ON documentos_finalizacao_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);

-- Permitir que fornecedores autenticados vejam seus próprios documentos
CREATE POLICY "Fornecedores podem ver seus próprios documentos de finalização"
ON documentos_finalizacao_fornecedor
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);

-- Permitir que usuários internos vejam todos os documentos
CREATE POLICY "Usuários internos podem ver documentos de finalização"
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