-- Add endereco_comercial to fornecedores table
ALTER TABLE public.fornecedores 
ADD COLUMN IF NOT EXISTS endereco_comercial TEXT;

-- Update documentos_fornecedor to ensure it has all necessary fields
-- The table already exists with the required structure