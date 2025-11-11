-- Adicionar campo de critério de julgamento nas cotações
ALTER TABLE cotacoes_precos 
ADD COLUMN criterio_julgamento TEXT DEFAULT 'global' CHECK (criterio_julgamento IN ('por_item', 'global', 'por_lote'));

-- Criar tabela de lotes para cotações
CREATE TABLE lotes_cotacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  numero_lote INTEGER NOT NULL,
  descricao_lote TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cotacao_id, numero_lote)
);

-- Adicionar campo lote_id nos itens de cotação (opcional, só quando for por lote)
ALTER TABLE itens_cotacao
ADD COLUMN lote_id UUID REFERENCES lotes_cotacao(id) ON DELETE SET NULL;

-- RLS para lotes_cotacao
ALTER TABLE lotes_cotacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage lotes cotacao"
ON lotes_cotacao
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Fornecedores can view lotes cotacao"
ON lotes_cotacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM cotacao_fornecedor_convites cfc
    JOIN fornecedores f ON f.id = cfc.fornecedor_id
    WHERE cfc.cotacao_id = lotes_cotacao.cotacao_id
      AND f.user_id = auth.uid()
  )
);

-- Trigger para updated_at em lotes_cotacao
CREATE TRIGGER update_lotes_cotacao_updated_at
BEFORE UPDATE ON lotes_cotacao
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();