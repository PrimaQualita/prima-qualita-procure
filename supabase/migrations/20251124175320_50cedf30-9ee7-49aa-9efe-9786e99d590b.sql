-- Adicionar campos de protocolo e hash na tabela de propostas de seleção
ALTER TABLE selecao_propostas_fornecedor 
ADD COLUMN IF NOT EXISTS protocolo TEXT,
ADD COLUMN IF NOT EXISTS hash_certificacao TEXT;

-- Criar índice para busca por protocolo
CREATE INDEX IF NOT EXISTS idx_selecao_propostas_protocolo ON selecao_propostas_fornecedor(protocolo);

-- Remover política se existir e recriar
DROP POLICY IF EXISTS "Public can verify selecao propostas by protocolo" ON selecao_propostas_fornecedor;

CREATE POLICY "Public can verify selecao propostas by protocolo"
ON selecao_propostas_fornecedor
FOR SELECT
TO public
USING (true);