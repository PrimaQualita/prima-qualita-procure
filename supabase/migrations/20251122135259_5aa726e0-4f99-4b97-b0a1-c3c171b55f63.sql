
-- Remover todas as políticas existentes para planilhas_consolidadas
DROP POLICY IF EXISTS "Internal users can create planilhas" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Authenticated users can create planilhas" ON planilhas_consolidadas;

-- Criar política simples que permite INSERT para usuários autenticados com perfil
CREATE POLICY "Users with profile can create planilhas" 
ON planilhas_consolidadas 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
  )
);

-- Permitir que usuários vejam suas próprias planilhas
CREATE POLICY "Users can view planilhas" 
ON planilhas_consolidadas 
FOR SELECT 
TO authenticated
USING (true);
