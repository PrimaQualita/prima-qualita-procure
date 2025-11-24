-- Permitir SELECT público em anexos_selecao para que fornecedores não autenticados possam ver documentos
DROP POLICY IF EXISTS "Public can view anexos_selecao" ON anexos_selecao;

CREATE POLICY "Public can view anexos_selecao"
ON anexos_selecao
FOR SELECT
TO public
USING (true);