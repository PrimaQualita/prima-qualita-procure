-- Adicionar coluna last_seen para rastrear quando o usuário estava online
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone DEFAULT now();

-- Criar índice para buscar usuários online rapidamente
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen);

-- Criar função para atualizar last_seen
CREATE OR REPLACE FUNCTION public.update_user_last_seen(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles 
  SET last_seen = now() 
  WHERE id = p_user_id;
END;
$$;

-- Enable realtime for profiles table para rastrear presença
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;