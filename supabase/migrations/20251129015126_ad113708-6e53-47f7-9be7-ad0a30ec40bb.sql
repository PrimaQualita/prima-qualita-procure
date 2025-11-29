
-- Dropar as funções com CASCADE para remover triggers automaticamente
DROP FUNCTION IF EXISTS delete_processo_anexo_storage() CASCADE;
DROP FUNCTION IF EXISTS delete_ata_selecao_storage() CASCADE;
DROP FUNCTION IF EXISTS delete_anexo_cotacao_fornecedor_storage() CASCADE;
DROP FUNCTION IF EXISTS delete_documento_fornecedor_storage() CASCADE;
DROP FUNCTION IF EXISTS delete_processo_anexo_trigger() CASCADE;

-- Deletar registros órfãos manualmente
DELETE FROM anexos_processo_compra 
WHERE url_arquivo LIKE '%5cf90747-3542-4536-bbf1-a864537db2f2%'
   OR url_arquivo LIKE '%e7246bfe-3bb2-4dd5-9da2-c3d3af045dd1%'
   OR url_arquivo LIKE '%5d5a0fbc-ad3b-4d14-81ff-b532e080f4ac%';

DELETE FROM atas_selecao 
WHERE url_arquivo LIKE '%atas-selecao/e1ce2f29-59e3-43cb-856d-80790a60f686%';

DELETE FROM anexos_cotacao_fornecedor 
WHERE url_arquivo LIKE '%proposta_22222222222222%'
   OR url_arquivo LIKE '%proposta_11111111111111%'
   OR url_arquivo LIKE '%proposta_01287776000105%'
   OR url_arquivo LIKE '%proposta_21665935000167%'
   OR url_arquivo LIKE '%proposta_49740697000126%'
   OR url_arquivo LIKE '%proposta_00000000000000%'
   OR url_arquivo LIKE '%proposta_01686431000116%';

DELETE FROM documentos_fornecedor 
WHERE url_arquivo LIKE '%fornecedor_1254e2fd-d84c-480c-ab3c-0621b63b0bd3%';
