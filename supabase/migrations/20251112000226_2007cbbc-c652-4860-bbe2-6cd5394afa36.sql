-- Adicionar coluna marca na tabela respostas_itens_fornecedor para cada fornecedor ter sua marca
ALTER TABLE respostas_itens_fornecedor ADD COLUMN IF NOT EXISTS marca TEXT;