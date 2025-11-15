-- Adicionar coluna para salvar o hash de certificação digital
ALTER TABLE cotacao_respostas_fornecedor
ADD COLUMN hash_certificacao TEXT;