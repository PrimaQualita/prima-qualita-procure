-- Adicionar campos de credenciamento e contratação específica
ALTER TABLE processos_compras
ADD COLUMN IF NOT EXISTS credenciamento boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS contratacao_especifica boolean DEFAULT false;