-- Adicionar coluna cargo na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;