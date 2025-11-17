-- Política para permitir UPDATE de fornecedores órfãos (user_id = NULL) durante cadastro público
-- Isso permite que fornecedores que responderam cotações sem cadastro possam completar seu cadastro
CREATE POLICY "Public can update orphan fornecedores during registration"
ON public.fornecedores
FOR UPDATE
USING (user_id IS NULL)
WITH CHECK (user_id IS NOT NULL);