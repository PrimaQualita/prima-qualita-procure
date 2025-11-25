-- Permitir que usuários internos (gestores) possam deletar lances
CREATE POLICY "Internal users can delete lances"
ON public.lances_fornecedores
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);