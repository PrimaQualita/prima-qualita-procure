-- Adicionar política pública para verificação de planilhas de lances por protocolo
CREATE POLICY "Public can verify planilhas lances by protocolo"
ON planilhas_lances_selecao
FOR SELECT
TO anon
USING (true);