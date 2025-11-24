-- Remover políticas antigas se existirem e criar novas

-- Política para visualizar seleções na verificação de propostas  
DROP POLICY IF EXISTS "Public can view selecoes for verification" ON selecoes_fornecedores;
CREATE POLICY "Public can view selecoes for verification"
ON selecoes_fornecedores
FOR SELECT
TO anon, authenticated
USING (true);

-- Política para visualizar processos na verificação de propostas
DROP POLICY IF EXISTS "Public can view processos for verification" ON processos_compras;
CREATE POLICY "Public can view processos for verification"
ON processos_compras
FOR SELECT
TO anon, authenticated
USING (true);