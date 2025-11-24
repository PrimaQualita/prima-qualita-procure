-- Criar tabela para propostas de fornecedores em seleções
CREATE TABLE IF NOT EXISTS public.selecao_propostas_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  valor_total_proposta DECIMAL NOT NULL,
  observacoes_fornecedor TEXT,
  data_envio_proposta TIMESTAMP WITH TIME ZONE DEFAULT now(),
  desclassificado BOOLEAN DEFAULT false,
  motivo_desclassificacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(selecao_id, fornecedor_id)
);

-- Criar tabela para itens das propostas de seleção
CREATE TABLE IF NOT EXISTS public.selecao_respostas_itens_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.selecao_propostas_fornecedor(id) ON DELETE CASCADE,
  numero_item INTEGER NOT NULL,
  descricao TEXT NOT NULL,
  quantidade DECIMAL NOT NULL,
  unidade TEXT NOT NULL,
  marca TEXT,
  valor_unitario_ofertado DECIMAL NOT NULL,
  valor_total_item DECIMAL NOT NULL,
  desclassificado BOOLEAN DEFAULT false,
  motivo_desclassificacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS policies para selecao_propostas_fornecedor
ALTER TABLE public.selecao_propostas_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fornecedores can create own propostas"
  ON public.selecao_propostas_fornecedor
  FOR INSERT
  WITH CHECK (
    fornecedor_id IN (
      SELECT id FROM public.fornecedores WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Fornecedores can view own propostas"
  ON public.selecao_propostas_fornecedor
  FOR SELECT
  USING (
    fornecedor_id IN (
      SELECT id FROM public.fornecedores WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Internal users can view all propostas"
  ON public.selecao_propostas_fornecedor
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid()
    )
  );

-- RLS policies para selecao_respostas_itens_fornecedor
ALTER TABLE public.selecao_respostas_itens_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fornecedores can create own itens"
  ON public.selecao_respostas_itens_fornecedor
  FOR INSERT
  WITH CHECK (
    proposta_id IN (
      SELECT sp.id 
      FROM public.selecao_propostas_fornecedor sp
      JOIN public.fornecedores f ON f.id = sp.fornecedor_id
      WHERE f.user_id = auth.uid()
    )
  );

CREATE POLICY "Fornecedores can view own itens"
  ON public.selecao_respostas_itens_fornecedor
  FOR SELECT
  USING (
    proposta_id IN (
      SELECT sp.id 
      FROM public.selecao_propostas_fornecedor sp
      JOIN public.fornecedores f ON f.id = sp.fornecedor_id
      WHERE f.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Internal users can view all itens"
  ON public.selecao_respostas_itens_fornecedor
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Índices para performance
CREATE INDEX idx_selecao_propostas_selecao ON public.selecao_propostas_fornecedor(selecao_id);
CREATE INDEX idx_selecao_propostas_fornecedor ON public.selecao_propostas_fornecedor(fornecedor_id);
CREATE INDEX idx_selecao_itens_proposta ON public.selecao_respostas_itens_fornecedor(proposta_id);