-- Adicionar campo para indicar se processo requer cotação
ALTER TABLE processos_compras 
ADD COLUMN requer_cotacao boolean DEFAULT true,
ADD COLUMN requer_selecao boolean DEFAULT false,
ADD COLUMN valor_total_cotacao numeric DEFAULT 0;

-- Criar tabela de itens de cotação
CREATE TABLE public.itens_cotacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id uuid NOT NULL REFERENCES cotacoes_precos(id) ON DELETE CASCADE,
  numero_item integer NOT NULL,
  descricao text NOT NULL,
  quantidade numeric NOT NULL,
  unidade text NOT NULL,
  valor_unitario_estimado numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Criar tabela de respostas dos fornecedores para cada item
CREATE TABLE public.respostas_itens_fornecedor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_cotacao_id uuid NOT NULL REFERENCES itens_cotacao(id) ON DELETE CASCADE,
  cotacao_resposta_fornecedor_id uuid NOT NULL REFERENCES cotacao_respostas_fornecedor(id) ON DELETE CASCADE,
  valor_unitario_ofertado numeric NOT NULL,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(item_cotacao_id, cotacao_resposta_fornecedor_id)
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE itens_cotacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE respostas_itens_fornecedor ENABLE ROW LEVEL SECURITY;

-- Políticas para itens_cotacao
CREATE POLICY "Internal users can manage itens cotacao"
ON itens_cotacao FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Fornecedores can view itens cotacao"
ON itens_cotacao FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cotacao_fornecedor_convites cfc
    JOIN fornecedores f ON f.id = cfc.fornecedor_id
    WHERE cfc.cotacao_id IN (SELECT cotacao_id FROM itens_cotacao WHERE itens_cotacao.id = itens_cotacao.id)
    AND f.user_id = auth.uid()
  )
);

-- Políticas para respostas_itens_fornecedor
CREATE POLICY "Internal users can view respostas itens"
ON respostas_itens_fornecedor FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Fornecedores can manage own respostas itens"
ON respostas_itens_fornecedor FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN fornecedores f ON f.id = crf.fornecedor_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND f.user_id = auth.uid()
  )
);

-- Trigger para atualizar updated_at em itens_cotacao
CREATE TRIGGER update_itens_cotacao_updated_at
BEFORE UPDATE ON itens_cotacao
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();