-- Adicionar campo para marcar se processo foi respondido pelo compliance
ALTER TABLE cotacoes_precos
ADD COLUMN IF NOT EXISTS respondido_compliance BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_resposta_compliance TIMESTAMP WITH TIME ZONE;