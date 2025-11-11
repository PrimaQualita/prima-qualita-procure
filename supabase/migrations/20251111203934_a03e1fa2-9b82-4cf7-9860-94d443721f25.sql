-- Permitir que usuários internos (gestores/colaboradores) possam atualizar documentos de fornecedores
CREATE POLICY "Internal users can update fornecedor documents"
ON public.documentos_fornecedor
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);