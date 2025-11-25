-- Adicionar campo protocolo na tabela planilhas_lances_selecao
ALTER TABLE planilhas_lances_selecao 
ADD COLUMN IF NOT EXISTS protocolo text;