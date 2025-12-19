-- Criar política para permitir que Gestores e Compliance insiram roles
CREATE POLICY "Gestores and Compliance can insert user_roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role) OR
  (SELECT compliance FROM public.profiles WHERE id = auth.uid()) = true
);

-- Criar política para permitir que Gestores e Compliance deletem roles  
CREATE POLICY "Gestores and Compliance can delete user_roles"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'gestor'::app_role) OR
  (SELECT compliance FROM public.profiles WHERE id = auth.uid()) = true
);

-- Criar política para permitir que Gestores e Compliance atualizem roles
CREATE POLICY "Gestores and Compliance can update user_roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'gestor'::app_role) OR
  (SELECT compliance FROM public.profiles WHERE id = auth.uid()) = true
)
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role) OR
  (SELECT compliance FROM public.profiles WHERE id = auth.uid()) = true
);