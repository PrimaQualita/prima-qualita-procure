-- Adicionar 'em_analise' e 'rejeitado' aos valores permitidos no status_solicitacao
ALTER TABLE campos_documentos_finalizacao 
DROP CONSTRAINT IF EXISTS campos_documentos_finalizacao_status_solicitacao_check;

ALTER TABLE campos_documentos_finalizacao 
ADD CONSTRAINT campos_documentos_finalizacao_status_solicitacao_check 
CHECK (status_solicitacao IN ('pendente', 'enviado', 'em_analise', 'aprovado', 'rejeitado', 'concluido'));