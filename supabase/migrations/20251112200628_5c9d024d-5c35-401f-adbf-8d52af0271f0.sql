-- Adicionar campos para rejeição de fornecedores na tabela cotacao_respostas_fornecedor
ALTER TABLE cotacao_respostas_fornecedor 
ADD COLUMN IF NOT EXISTS rejeitado BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
ADD COLUMN IF NOT EXISTS data_rejeicao TIMESTAMP WITH TIME ZONE;