-- Adicionar políticas RLS para permitir acesso público às tabelas relacionadas durante verificação
DROP POLICY IF EXISTS "Public can view fornecedores for verification" ON fornecedores;
DROP POLICY IF EXISTS "Public can view selecoes for verification" ON selecoes_fornecedores;
DROP POLICY IF EXISTS "Public can view processos for verification" ON processos_compras;

CREATE POLICY "Public can view fornecedores for verification"
ON fornecedores
FOR SELECT
USING (true);

CREATE POLICY "Public can view selecoes for verification"
ON selecoes_fornecedores
FOR SELECT
USING (true);

CREATE POLICY "Public can view processos for verification"
ON processos_compras
FOR SELECT
USING (true);