-- Adicionar coluna responsaveis_legais como JSONB para armazenar múltiplos responsáveis
ALTER TABLE public.fornecedores ADD COLUMN IF NOT EXISTS responsaveis_legais jsonb DEFAULT '[]'::jsonb;