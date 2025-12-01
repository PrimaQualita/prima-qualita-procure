-- Criar política RLS para verificação pública de respostas_recursos
CREATE POLICY "Public can verify respostas recursos by protocolo"
ON public.respostas_recursos
FOR SELECT
USING (protocolo IS NOT NULL);