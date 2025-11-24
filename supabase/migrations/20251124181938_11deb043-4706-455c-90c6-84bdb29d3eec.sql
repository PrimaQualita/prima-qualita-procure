-- Criar política RLS para permitir verificação pública de propostas de seleção por protocolo
CREATE POLICY "Public can verify selection proposals by protocolo"
ON selecao_propostas_fornecedor
FOR SELECT
USING (true);