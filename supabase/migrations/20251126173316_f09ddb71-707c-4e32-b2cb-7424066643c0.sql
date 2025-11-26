-- Drop the existing check constraint
ALTER TABLE public.avaliacoes_cadastro_fornecedor 
DROP CONSTRAINT IF EXISTS avaliacoes_cadastro_fornecedor_status_avaliacao_check;

-- Add updated check constraint with all valid values
ALTER TABLE public.avaliacoes_cadastro_fornecedor
ADD CONSTRAINT avaliacoes_cadastro_fornecedor_status_avaliacao_check 
CHECK (status_avaliacao IN ('pendente', 'respondido'));