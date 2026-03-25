-- Drop partial indexes that don't work with ON CONFLICT
DROP INDEX IF EXISTS public.processos_para_contratar_unique_processo_fornecedor;
DROP INDEX IF EXISTS public.processos_para_contratar_unique_generico;

-- Create a regular unique constraint that works with ON CONFLICT
ALTER TABLE public.processos_para_contratar
ADD CONSTRAINT unique_processo_fornecedor UNIQUE (processo_compra_id, fornecedor_vencedor_id);