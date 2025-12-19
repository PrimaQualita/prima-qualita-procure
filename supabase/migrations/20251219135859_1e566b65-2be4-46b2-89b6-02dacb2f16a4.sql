-- Adicionar coluna superintendente_executivo na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS superintendente_executivo boolean DEFAULT false;

-- Comentário explicativo
COMMENT ON COLUMN public.profiles.superintendente_executivo IS 'Indica se o usuário é Superintendente Executivo com permissão para gerar Autorização de Despesas';