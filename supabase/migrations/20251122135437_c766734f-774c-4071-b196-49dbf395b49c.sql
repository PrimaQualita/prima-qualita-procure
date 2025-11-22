
-- Remover política problemática
DROP POLICY IF EXISTS "Users with profile can create planilhas" ON planilhas_consolidadas;

-- Criar política simples baseada apenas em autenticação
CREATE POLICY "Authenticated users can insert planilhas" 
ON planilhas_consolidadas 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = usuario_gerador_id);
