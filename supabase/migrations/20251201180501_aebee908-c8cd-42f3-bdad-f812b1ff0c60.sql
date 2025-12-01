-- Permitir verificação pública de propostas de cotação por protocolo
CREATE POLICY "Public can verify cotacao propostas by protocolo"
ON cotacao_respostas_fornecedor
FOR SELECT
USING (protocolo IS NOT NULL);