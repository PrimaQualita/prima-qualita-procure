-- Adicionar coluna nome_arquivo à tabela encaminhamentos_processo
ALTER TABLE encaminhamentos_processo 
ADD COLUMN nome_arquivo TEXT;