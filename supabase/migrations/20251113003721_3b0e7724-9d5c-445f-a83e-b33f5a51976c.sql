-- Tabela para rastrear fornecedores rejeitados em cotações
CREATE TABLE public.fornecedores_rejeitados_cotacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  motivo_rejeicao TEXT NOT NULL,
  usuario_rejeitou_id UUID NOT NULL REFERENCES public.profiles(id),
  data_rejeicao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status_recurso TEXT DEFAULT 'sem_recurso' CHECK (status_recurso IN ('sem_recurso', 'recurso_enviado', 'recurso_deferido', 'recurso_indeferido')),
  revertido BOOLEAN DEFAULT false,
  usuario_reverteu_id UUID REFERENCES public.profiles(id),
  data_reversao TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para recursos anexados por fornecedores rejeitados
CREATE TABLE public.recursos_fornecedor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rejeicao_id UUID NOT NULL REFERENCES public.fornecedores_rejeitados_cotacao(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  mensagem_fornecedor TEXT,
  data_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Políticas RLS para fornecedores_rejeitados_cotacao
ALTER TABLE public.fornecedores_rejeitados_cotacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage rejeitados"
ON public.fornecedores_rejeitados_cotacao
FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
));

CREATE POLICY "Fornecedores can view own rejeitados"
ON public.fornecedores_rejeitados_cotacao
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM fornecedores 
  WHERE fornecedores.id = fornecedores_rejeitados_cotacao.fornecedor_id 
  AND fornecedores.user_id = auth.uid()
));

-- Políticas RLS para recursos_fornecedor
ALTER TABLE public.recursos_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view recursos"
ON public.recursos_fornecedor
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
));

CREATE POLICY "Fornecedores can create own recursos"
ON public.recursos_fornecedor
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM fornecedores 
  WHERE fornecedores.id = recursos_fornecedor.fornecedor_id 
  AND fornecedores.user_id = auth.uid()
));

CREATE POLICY "Fornecedores can view own recursos"
ON public.recursos_fornecedor
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM fornecedores 
  WHERE fornecedores.id = recursos_fornecedor.fornecedor_id 
  AND fornecedores.user_id = auth.uid()
));

-- Índices para performance
CREATE INDEX idx_fornecedores_rejeitados_cotacao ON fornecedores_rejeitados_cotacao(cotacao_id, fornecedor_id);
CREATE INDEX idx_recursos_fornecedor_rejeicao ON recursos_fornecedor(rejeicao_id);