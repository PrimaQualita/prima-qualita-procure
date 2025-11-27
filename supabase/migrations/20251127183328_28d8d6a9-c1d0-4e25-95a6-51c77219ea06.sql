-- Adicionar coluna para armazenar estimativas calculadas na planilha consolidada
ALTER TABLE planilhas_consolidadas 
ADD COLUMN IF NOT EXISTS estimativas_itens jsonb DEFAULT '{}'::jsonb;