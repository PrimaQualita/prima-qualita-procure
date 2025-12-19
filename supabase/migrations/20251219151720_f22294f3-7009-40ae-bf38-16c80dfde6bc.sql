-- Adicionar campo de gênero ao perfil do usuário
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS genero text DEFAULT 'feminino';

-- Comentário explicativo
COMMENT ON COLUMN public.profiles.genero IS 'Gênero do usuário: masculino ou feminino';