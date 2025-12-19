-- Adicionar coluna contabilidade na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contabilidade boolean DEFAULT false;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.profiles.contabilidade IS 'Indica se o usuário tem acesso ao menu de Contabilidade';