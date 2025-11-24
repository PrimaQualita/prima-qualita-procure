-- Adicionar política RLS para permitir UPDATE de protocolo em propostas de seleção
DROP POLICY IF EXISTS "Anyone can update protocolo for selection proposals" ON selecao_propostas_fornecedor;

CREATE POLICY "Anyone can update selection proposal protocolo"
ON selecao_propostas_fornecedor
FOR UPDATE
USING (true)
WITH CHECK (true);