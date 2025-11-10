-- Adicionar campo de pontuação nas perguntas de due diligence
ALTER TABLE perguntas_due_diligence 
ADD COLUMN pontuacao_sim integer DEFAULT 0,
ADD COLUMN pontuacao_nao integer DEFAULT 200;

-- Adicionar campo para data de validade do certificado no fornecedor
ALTER TABLE fornecedores
ADD COLUMN data_validade_certificado date;