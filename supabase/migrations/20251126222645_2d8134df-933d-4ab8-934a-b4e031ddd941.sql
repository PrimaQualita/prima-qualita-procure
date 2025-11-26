-- Adicionar política para permitir verificação pública de recursos por protocolo
CREATE POLICY "Public can verify recursos by protocolo"
ON public.recursos_inabilitacao_selecao
FOR SELECT
USING (true);