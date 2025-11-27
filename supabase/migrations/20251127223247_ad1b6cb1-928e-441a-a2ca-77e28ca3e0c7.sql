-- Criar tabela para homologações de seleção
CREATE TABLE IF NOT EXISTS public.homologacoes_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id),
  protocolo TEXT NOT NULL UNIQUE,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_gerador_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.homologacoes_selecao ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Internal users can manage homologacoes"
  ON public.homologacoes_selecao
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Public can verify homologacoes by protocolo"
  ON public.homologacoes_selecao
  FOR SELECT
  USING (true);

-- Index
CREATE INDEX idx_homologacoes_selecao_id ON public.homologacoes_selecao(selecao_id);
CREATE INDEX idx_homologacoes_protocolo ON public.homologacoes_selecao(protocolo);