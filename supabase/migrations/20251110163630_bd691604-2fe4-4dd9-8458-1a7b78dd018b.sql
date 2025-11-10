-- Adicionar campos para controle de primeiro acesso
ALTER TABLE public.profiles 
ADD COLUMN primeiro_acesso BOOLEAN DEFAULT TRUE,
ADD COLUMN senha_temporaria BOOLEAN DEFAULT FALSE;

-- Atualizar profiles existentes
UPDATE public.profiles 
SET primeiro_acesso = FALSE 
WHERE data_ultimo_login IS NOT NULL;