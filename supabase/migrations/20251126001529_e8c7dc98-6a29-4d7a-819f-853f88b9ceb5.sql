-- Adicionar coluna para rastrear itens que já tiveram negociação concluída
ALTER TABLE itens_abertos_lances 
ADD COLUMN IF NOT EXISTS negociacao_concluida BOOLEAN DEFAULT FALSE;

-- Adicionar coluna para marcar itens que o gestor optou por não negociar
ALTER TABLE itens_abertos_lances 
ADD COLUMN IF NOT EXISTS nao_negociar BOOLEAN DEFAULT FALSE;