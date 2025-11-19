-- Adicionar campos para rastrear solicitação de atualização de documentos de cadastro
ALTER TABLE documentos_fornecedor 
ADD COLUMN IF NOT EXISTS atualizacao_solicitada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_solicitacao_atualizacao timestamp with time zone,
ADD COLUMN IF NOT EXISTS motivo_solicitacao_atualizacao text;