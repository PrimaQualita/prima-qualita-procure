-- Adicionar campo para vincular documentos solicitados ao fornecedor específico
ALTER TABLE campos_documentos_finalizacao 
ADD COLUMN IF NOT EXISTS fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS status_solicitacao TEXT DEFAULT 'pendente' CHECK (status_solicitacao IN ('pendente', 'enviado', 'concluido', 'aprovado')),
ADD COLUMN IF NOT EXISTS data_solicitacao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS data_aprovacao TIMESTAMP WITH TIME ZONE;

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_campos_documentos_fornecedor ON campos_documentos_finalizacao(fornecedor_id);

-- Adicionar campo na tabela cotacoes_precos para controlar aprovação de documentos dos fornecedores
ALTER TABLE cotacoes_precos
ADD COLUMN IF NOT EXISTS documentos_aprovados JSONB DEFAULT '{}';

-- Comentários explicativos
COMMENT ON COLUMN campos_documentos_finalizacao.fornecedor_id IS 'Fornecedor para qual os documentos foram solicitados';
COMMENT ON COLUMN campos_documentos_finalizacao.status_solicitacao IS 'Status da solicitação: pendente (criado mas não enviado), enviado (notificado ao fornecedor), concluido (fornecedor enviou), aprovado (gestor aprovou)';
COMMENT ON COLUMN cotacoes_precos.documentos_aprovados IS 'JSON com IDs dos fornecedores que tiveram documentos aprovados {fornecedor_id: true}';