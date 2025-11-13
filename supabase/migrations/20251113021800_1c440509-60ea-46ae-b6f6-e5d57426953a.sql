-- Adicionar coluna motivo_reversao na tabela fornecedores_rejeitados_cotacao
ALTER TABLE fornecedores_rejeitados_cotacao 
ADD COLUMN IF NOT EXISTS motivo_reversao TEXT;