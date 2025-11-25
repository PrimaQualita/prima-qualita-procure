-- Criar tabela para fornecedores inabilitados em seleções de fornecedores
CREATE TABLE public.fornecedores_inabilitados_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id),
  itens_afetados INTEGER[] NOT NULL DEFAULT '{}',
  motivo_inabilitacao TEXT NOT NULL,
  data_inabilitacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_inabilitou_id UUID NOT NULL,
  revertido BOOLEAN DEFAULT false,
  data_reversao TIMESTAMP WITH TIME ZONE,
  motivo_reversao TEXT,
  usuario_reverteu_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fornecedores_inabilitados_selecao ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Internal users can manage inabilitados selecao"
ON public.fornecedores_inabilitados_selecao
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Fornecedores can view own inabilitacao"
ON public.fornecedores_inabilitados_selecao
FOR SELECT
USING (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()));

-- Index for faster queries
CREATE INDEX idx_fornecedores_inabilitados_selecao_selecao_id ON public.fornecedores_inabilitados_selecao(selecao_id);
CREATE INDEX idx_fornecedores_inabilitados_selecao_fornecedor_id ON public.fornecedores_inabilitados_selecao(fornecedor_id);