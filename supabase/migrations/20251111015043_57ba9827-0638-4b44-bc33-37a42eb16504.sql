-- Permitir que qualquer pessoa visualize fornecedores não autenticados (user_id null)
CREATE POLICY "Public can view unauthenticated fornecedores"
ON fornecedores
FOR SELECT
TO public
USING (user_id IS NULL OR user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
));