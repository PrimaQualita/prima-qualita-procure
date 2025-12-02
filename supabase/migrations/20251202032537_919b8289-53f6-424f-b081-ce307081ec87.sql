-- Adicionar política de DELETE para respostas_recursos
CREATE POLICY "Authenticated users can delete respostas recursos"
ON public.respostas_recursos
FOR DELETE
TO authenticated
USING (true);