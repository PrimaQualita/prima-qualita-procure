-- Permitir buscar fornecedor por CNPJ publicamente (para verificação de duplicata)
DROP POLICY IF EXISTS "Public can view unauthenticated fornecedores" ON fornecedores;

CREATE POLICY "Public can view fornecedores by CNPJ"
ON fornecedores
FOR SELECT
TO public
USING (true);