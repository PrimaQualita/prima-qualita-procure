
-- Remover TODAS as políticas existentes de planilhas_consolidadas
DROP POLICY IF EXISTS "Authenticated users can delete planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Authenticated users can view planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Authenticated users can insert planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Internal users can delete planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Internal users can view planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Internal users can create planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Users with profile can create planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Public can verify planilhas by protocolo" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Users can view planilhas" ON planilhas_consolidadas;

-- Criar políticas limpas e simples
-- INSERT: Qualquer usuário autenticado pode criar planilha
CREATE POLICY "Enable insert for authenticated users"
ON planilhas_consolidadas
FOR INSERT
TO authenticated
WITH CHECK (true);

-- SELECT: Qualquer um pode visualizar (para verificação pública)
CREATE POLICY "Enable read access for all users"
ON planilhas_consolidadas
FOR SELECT
TO authenticated
USING (true);

-- SELECT: Público pode verificar por protocolo
CREATE POLICY "Enable public verification by protocolo"
ON planilhas_consolidadas
FOR SELECT
TO anon
USING (true);

-- DELETE: Apenas usuários internos podem deletar
CREATE POLICY "Enable delete for internal users"
ON planilhas_consolidadas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
  )
);
