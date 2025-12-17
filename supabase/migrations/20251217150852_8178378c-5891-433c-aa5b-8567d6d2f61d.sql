-- Corrigir política de verificação pública para planilhas_consolidadas
DROP POLICY IF EXISTS "Public can verify planilhas by protocolo only" ON public.planilhas_consolidadas;
DROP POLICY IF EXISTS "Public can verify planilhas consolidadas by protocolo" ON public.planilhas_consolidadas;

CREATE POLICY "Public can verify planilhas consolidadas by protocolo"
ON public.planilhas_consolidadas
FOR SELECT
TO anon
USING (protocolo IS NOT NULL);