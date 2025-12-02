-- Adicionar policy de UPDATE para respostas_recursos
CREATE POLICY "Authenticated users can update respostas recursos"
ON public.respostas_recursos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);