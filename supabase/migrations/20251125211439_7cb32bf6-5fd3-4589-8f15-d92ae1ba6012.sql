-- Remover constraint UNIQUE de selecao_id para permitir múltiplas planilhas por seleção
ALTER TABLE planilhas_lances_selecao 
DROP CONSTRAINT IF EXISTS planilhas_lances_selecao_selecao_id_key;