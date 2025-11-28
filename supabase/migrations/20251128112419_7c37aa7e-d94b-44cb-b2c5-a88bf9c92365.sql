-- Adicionar campos para controle de assinatura de homologações
ALTER TABLE homologacoes_selecao 
ADD COLUMN IF NOT EXISTS status_assinatura TEXT DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS data_envio_assinatura TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS data_assinatura TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS responsavel_legal_id UUID REFERENCES profiles(id);

-- Criar índice para buscar homologações pendentes por responsável legal
CREATE INDEX IF NOT EXISTS idx_homologacoes_responsavel_legal 
ON homologacoes_selecao(responsavel_legal_id, status_assinatura);

-- Comentários explicativos
COMMENT ON COLUMN homologacoes_selecao.status_assinatura IS 'Status da assinatura: pendente, aceito, rejeitado';
COMMENT ON COLUMN homologacoes_selecao.data_envio_assinatura IS 'Data/hora em que foi enviado para assinatura do responsável legal';
COMMENT ON COLUMN homologacoes_selecao.data_assinatura IS 'Data/hora em que o responsável legal assinou';
COMMENT ON COLUMN homologacoes_selecao.responsavel_legal_id IS 'ID do usuário responsável legal que deve assinar';