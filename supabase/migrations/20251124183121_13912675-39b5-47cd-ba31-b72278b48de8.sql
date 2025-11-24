
-- Remover policies existentes que possam estar conflitando
DROP POLICY IF EXISTS "Public can verify selecao propostas by protocolo" ON selecao_propostas_fornecedor;
DROP POLICY IF EXISTS "Public can view selecoes for verification" ON selecoes_fornecedores;

-- Adicionar policy pública para verificação de propostas de seleção
CREATE POLICY "Public can verify selecao propostas by protocolo"
ON selecao_propostas_fornecedor
FOR SELECT
TO public
USING (true);

-- Adicionar policy pública para verificação de seleções
CREATE POLICY "Public can view selecoes for verification"
ON selecoes_fornecedores
FOR SELECT
TO public
USING (true);
