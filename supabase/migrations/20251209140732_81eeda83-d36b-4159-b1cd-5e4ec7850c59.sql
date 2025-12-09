-- Remover a política que causa recursão infinita
DROP POLICY IF EXISTS "Internal users can view all profiles" ON public.profiles;

-- Criar função SECURITY DEFINER para verificar se é usuário interno (bypassa RLS)
CREATE OR REPLACE FUNCTION public.is_internal_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
  )
$$;

-- Nova política usando a função (sem recursão)
CREATE POLICY "Internal users can view all profiles"
ON public.profiles
FOR SELECT
USING (
  public.is_internal_user(auth.uid())
);