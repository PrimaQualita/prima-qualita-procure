-- Permitir que usuários internos (gestores e colaboradores) possam deletar relatórios finais
CREATE POLICY "Internal users can delete relatorios finais"
ON public.relatorios_finais
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);