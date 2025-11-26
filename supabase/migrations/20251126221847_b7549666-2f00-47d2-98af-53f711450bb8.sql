-- Adicionar coluna protocolo_recurso para armazenar protocolo do recurso do fornecedor
ALTER TABLE public.recursos_inabilitacao_selecao 
ADD COLUMN IF NOT EXISTS protocolo_recurso TEXT;