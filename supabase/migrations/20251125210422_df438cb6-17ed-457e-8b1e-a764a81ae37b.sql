-- Adicionar constraint UNIQUE em selecao_id para permitir apenas uma planilha por seleção
ALTER TABLE planilhas_lances_selecao 
ADD CONSTRAINT planilhas_lances_selecao_selecao_id_key UNIQUE (selecao_id);