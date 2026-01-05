-- Permitir que usuários internos (profiles) também insiram lances
-- Isso é necessário porque gestores podem precisar testar ou a tabela é gerenciada internamente

CREATE POLICY "Internal users can insert lances"
ON public.lances_fornecedores
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);
