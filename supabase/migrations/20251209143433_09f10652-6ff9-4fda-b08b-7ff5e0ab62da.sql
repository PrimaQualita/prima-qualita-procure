-- REVERTER: Remover política restritiva que quebrou o sistema
DROP POLICY IF EXISTS "Public can check CNPJ exists for registration" ON public.fornecedores;

-- Restaurar política anterior que funcionava: permitir visualização para verificação
-- Esta política é necessária para o fluxo de cotação onde fornecedores não autenticados
-- precisam verificar se já existe cadastro com aquele CNPJ
CREATE POLICY "Public can check fornecedor by CNPJ" 
ON public.fornecedores 
FOR SELECT 
TO public 
USING (true);

-- Restaurar política de verificação para atas e propostas
CREATE POLICY "Public can view fornecedores for verification" 
ON public.fornecedores 
FOR SELECT 
TO anon 
USING (true);