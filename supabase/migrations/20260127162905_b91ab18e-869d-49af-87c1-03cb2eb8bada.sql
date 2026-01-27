-- Adicionar campos para controle de primeiro acesso/senha temporária nos fornecedores
ALTER TABLE public.fornecedores
ADD COLUMN IF NOT EXISTS primeiro_acesso boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS senha_temporaria boolean DEFAULT false;