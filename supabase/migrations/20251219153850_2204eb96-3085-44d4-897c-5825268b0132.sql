-- Permitir que gestores atualizem perfis (ex.: gênero) via aplicação
DROP POLICY IF EXISTS "Gestores can update any profile" ON public.profiles;

CREATE POLICY "Gestores can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));
