-- Adicionar coluna para armazenar URLs dos comprovantes originais
ALTER TABLE cotacao_respostas_fornecedor 
ADD COLUMN comprovantes_urls text[] DEFAULT '{}';

COMMENT ON COLUMN cotacao_respostas_fornecedor.comprovantes_urls IS 'URLs dos comprovantes originais anexados à proposta';