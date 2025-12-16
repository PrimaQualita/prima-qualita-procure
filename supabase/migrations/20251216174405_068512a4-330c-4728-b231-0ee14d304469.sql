-- Tabela para armazenar propostas realinhadas dos fornecedores vencedores
CREATE TABLE public.propostas_realinhadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  data_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valor_total_proposta NUMERIC NOT NULL DEFAULT 0,
  observacoes TEXT,
  url_pdf_proposta TEXT,
  protocolo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(selecao_id, fornecedor_id)
);

-- Tabela para armazenar itens individuais da proposta realinhada
CREATE TABLE public.propostas_realinhadas_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposta_realinhada_id UUID NOT NULL REFERENCES public.propostas_realinhadas(id) ON DELETE CASCADE,
  numero_item INTEGER NOT NULL,
  numero_lote INTEGER,
  descricao TEXT NOT NULL,
  quantidade NUMERIC NOT NULL,
  unidade TEXT NOT NULL,
  valor_unitario NUMERIC NOT NULL,
  valor_total NUMERIC NOT NULL,
  marca TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.propostas_realinhadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas_realinhadas_itens ENABLE ROW LEVEL SECURITY;

-- Policies para propostas_realinhadas
CREATE POLICY "Fornecedores podem ver suas propostas realinhadas"
ON public.propostas_realinhadas
FOR SELECT
USING (
  fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Fornecedores podem criar suas propostas realinhadas"
ON public.propostas_realinhadas
FOR INSERT
WITH CHECK (
  fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
);

CREATE POLICY "Fornecedores podem atualizar suas propostas realinhadas"
ON public.propostas_realinhadas
FOR UPDATE
USING (
  fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
);

CREATE POLICY "Usuários internos podem gerenciar propostas realinhadas"
ON public.propostas_realinhadas
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));

-- Policies para propostas_realinhadas_itens
CREATE POLICY "Fornecedores podem ver itens de suas propostas"
ON public.propostas_realinhadas_itens
FOR SELECT
USING (
  proposta_realinhada_id IN (
    SELECT id FROM propostas_realinhadas 
    WHERE fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Fornecedores podem criar itens de suas propostas"
ON public.propostas_realinhadas_itens
FOR INSERT
WITH CHECK (
  proposta_realinhada_id IN (
    SELECT id FROM propostas_realinhadas 
    WHERE fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Fornecedores podem atualizar itens de suas propostas"
ON public.propostas_realinhadas_itens
FOR UPDATE
USING (
  proposta_realinhada_id IN (
    SELECT id FROM propostas_realinhadas 
    WHERE fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Fornecedores podem deletar itens de suas propostas"
ON public.propostas_realinhadas_itens
FOR DELETE
USING (
  proposta_realinhada_id IN (
    SELECT id FROM propostas_realinhadas 
    WHERE fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Usuários internos podem gerenciar itens de propostas"
ON public.propostas_realinhadas_itens
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));

-- Index para performance
CREATE INDEX idx_propostas_realinhadas_selecao ON public.propostas_realinhadas(selecao_id);
CREATE INDEX idx_propostas_realinhadas_fornecedor ON public.propostas_realinhadas(fornecedor_id);
CREATE INDEX idx_propostas_realinhadas_itens_proposta ON public.propostas_realinhadas_itens(proposta_realinhada_id);