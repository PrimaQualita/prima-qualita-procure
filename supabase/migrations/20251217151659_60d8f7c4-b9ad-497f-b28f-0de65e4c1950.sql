-- Corrigir política de verificação pública para cotacao_respostas_fornecedor
DROP POLICY IF EXISTS "Public can verify proposals by protocolo only" ON public.cotacao_respostas_fornecedor;

CREATE POLICY "Public can verify cotacao proposals by protocolo"
ON public.cotacao_respostas_fornecedor
FOR SELECT
TO anon
USING (protocolo IS NOT NULL);