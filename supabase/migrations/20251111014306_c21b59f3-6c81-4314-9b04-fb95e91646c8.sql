-- Permitir que fornecedores não autenticados criem seu registro ao responder cotação
DROP POLICY IF EXISTS "Anyone can create fornecedor account" ON fornecedores;

CREATE POLICY "Anyone can create fornecedor account"
ON fornecedores
FOR INSERT
TO public
WITH CHECK (true);