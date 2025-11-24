-- Adicionar coluna para armazenar URL do PDF da proposta
ALTER TABLE selecao_propostas_fornecedor 
ADD COLUMN url_pdf_proposta TEXT;