-- Permitir verificação pública de planilhas consolidadas por protocolo
CREATE POLICY "Public can verify planilhas by protocolo"
ON planilhas_consolidadas
FOR SELECT
USING (protocolo IS NOT NULL);