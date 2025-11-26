-- Tabela para rastrear envios de cadastro de fornecedor ao Compliance
CREATE TABLE public.avaliacoes_cadastro_fornecedor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  data_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  enviado_por_id UUID REFERENCES public.profiles(id),
  status_avaliacao TEXT NOT NULL DEFAULT 'pendente' CHECK (status_avaliacao IN ('pendente', 'em_analise', 'concluido')),
  score_risco_total INTEGER,
  classificacao_risco TEXT,
  observacoes_compliance TEXT,
  data_resposta TIMESTAMP WITH TIME ZONE,
  usuario_compliance_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.avaliacoes_cadastro_fornecedor ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can view avaliacoes cadastro"
  ON public.avaliacoes_cadastro_fornecedor
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Internal users can create avaliacoes cadastro"
  ON public.avaliacoes_cadastro_fornecedor
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Compliance users can update avaliacoes cadastro"
  ON public.avaliacoes_cadastro_fornecedor
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.compliance = true OR profiles.responsavel_legal = true)
  ));

-- Índices
CREATE INDEX idx_avaliacoes_cadastro_fornecedor_id ON public.avaliacoes_cadastro_fornecedor(fornecedor_id);
CREATE INDEX idx_avaliacoes_cadastro_status ON public.avaliacoes_cadastro_fornecedor(status_avaliacao);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_avaliacoes_cadastro_updated_at
  BEFORE UPDATE ON public.avaliacoes_cadastro_fornecedor
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();