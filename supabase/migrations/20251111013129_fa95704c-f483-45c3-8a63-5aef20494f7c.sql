-- Tabela para armazenar campos de documentos personalizados que o gestor define para finalização
CREATE TABLE campos_documentos_finalizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  nome_campo TEXT NOT NULL,
  descricao TEXT,
  obrigatorio BOOLEAN DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cotacao_id, ordem)
);

-- Tabela para armazenar os uploads dos fornecedores dos documentos de finalização
CREATE TABLE documentos_finalizacao_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campo_documento_id UUID NOT NULL REFERENCES campos_documentos_finalizacao(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  data_upload TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campo_documento_id, fornecedor_id)
);

-- Adicionar campo para identificar fornecedor vencedor na cotação
ALTER TABLE cotacoes_precos
ADD COLUMN fornecedor_vencedor_id UUID REFERENCES fornecedores(id) ON DELETE SET NULL,
ADD COLUMN processo_finalizado BOOLEAN DEFAULT false,
ADD COLUMN data_finalizacao TIMESTAMPTZ;

-- RLS para campos_documentos_finalizacao
ALTER TABLE campos_documentos_finalizacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage campos documentos"
ON campos_documentos_finalizacao
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Fornecedores can view campos documentos"
ON campos_documentos_finalizacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cotacoes_precos c
    JOIN fornecedores f ON f.id = c.fornecedor_vencedor_id
    WHERE c.id = campos_documentos_finalizacao.cotacao_id
      AND f.user_id = auth.uid()
  )
);

-- RLS para documentos_finalizacao_fornecedor
ALTER TABLE documentos_finalizacao_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view documentos finalizacao"
ON documentos_finalizacao_fornecedor
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Fornecedores can manage own documentos finalizacao"
ON documentos_finalizacao_fornecedor
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM fornecedores
    WHERE fornecedores.id = documentos_finalizacao_fornecedor.fornecedor_id
      AND fornecedores.user_id = auth.uid()
  )
);