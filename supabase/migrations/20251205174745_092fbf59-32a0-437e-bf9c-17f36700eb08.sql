-- Criar política para permitir usuários internos deletarem recursos
CREATE POLICY "Usuarios internos podem deletar recursos"
ON public.recursos_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);