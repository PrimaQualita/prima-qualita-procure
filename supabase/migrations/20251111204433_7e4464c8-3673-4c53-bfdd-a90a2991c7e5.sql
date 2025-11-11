-- Permitir que usuários internos (gestores/colaboradores) possam deletar documentos de fornecedores
CREATE POLICY "Internal users can delete fornecedor documents"
ON public.documentos_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);