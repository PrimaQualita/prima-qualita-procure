-- Permitir verificação pública de autenticidade por protocolo (Proposta Realinhada)
-- A página /verificar-proposta usa o cliente público (anônimo), então precisamos liberar SELECT controlado.

CREATE POLICY "Public can verify propostas realinhadas by protocolo"
ON public.propostas_realinhadas
FOR SELECT
USING (protocolo IS NOT NULL);
