-- Corrigir políticas RLS para documentos_finalizacao_fornecedor
-- Remover todas as políticas antigas
DROP POLICY IF EXISTS "Fornecedores podem inserir seus próprios documentos de finalização" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Fornecedores podem ver seus próprios documentos de finalização" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Usuários internos podem ver documentos de finalização" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Fornecedores can manage own documentos finalizacao" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Fornecedores podem inserir seus próprios documentos de finalizaç" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Fornecedores podem ver seus próprios documentos de finalizaç" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Internal users can view documentos finalizacao" ON documentos_finalizacao_fornecedor;
DROP POLICY IF EXISTS "Usuários internos podem ver documentos de finalização" ON documentos_finalizacao_fornecedor;

-- Política para fornecedores fazerem SELECT dos seus documentos
CREATE POLICY "fornecedores_select_own_docs"
ON documentos_finalizacao_fornecedor
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = documentos_finalizacao_fornecedor.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);

-- Política para fornecedores fazerem INSERT dos seus documentos
CREATE POLICY "fornecedores_insert_own_docs"
ON documentos_finalizacao_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = documentos_finalizacao_fornecedor.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);

-- Política para fornecedores fazerem UPDATE dos seus documentos
CREATE POLICY "fornecedores_update_own_docs"
ON documentos_finalizacao_fornecedor
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = documentos_finalizacao_fornecedor.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = documentos_finalizacao_fornecedor.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);

-- Política para usuários internos verem todos os documentos
CREATE POLICY "internal_users_select_all_docs"
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