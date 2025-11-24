-- Adicionar campos para controlar o fechamento gradual de itens
ALTER TABLE itens_abertos_lances 
ADD COLUMN IF NOT EXISTS iniciando_fechamento BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_inicio_fechamento TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS segundos_para_fechar INTEGER;