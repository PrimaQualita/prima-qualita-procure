-- Permitir que usuários não autenticados busquem fornecedores por CNPJ
-- Isso é necessário para o fluxo de resposta de cotação funcionar
DROP POLICY IF EXISTS "Public can check fornecedor by CNPJ" ON fornecedores;

CREATE POLICY "Public can check fornecedor by CNPJ"
ON fornecedores
FOR SELECT
USING (true);