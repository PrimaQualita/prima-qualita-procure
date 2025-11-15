-- Adicionar política pública para permitir verificação de análises de compliance por protocolo
CREATE POLICY "Public can verify analises compliance by protocolo"
ON public.analises_compliance
FOR SELECT
TO public
USING (true);