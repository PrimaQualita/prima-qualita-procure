-- Fix fornecedores table: Remove overly permissive USING(true) policies
DROP POLICY IF EXISTS "Public can check fornecedor by CNPJ" ON fornecedores;
DROP POLICY IF EXISTS "Public can view fornecedores for verification" ON fornecedores;

-- Create restricted policy: only allow checking if CNPJ exists for registration purposes
-- This allows the registration flow to check for duplicate CNPJ without exposing all data
CREATE POLICY "Public can check CNPJ exists for registration" 
ON fornecedores FOR SELECT TO public
USING (
  -- Only allow checking unregistered suppliers (no user_id linked yet)
  user_id IS NULL
);