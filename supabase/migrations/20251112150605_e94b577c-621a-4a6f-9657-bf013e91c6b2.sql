-- Criar tabela para armazenar autorizações de processos
CREATE TABLE public.autorizacoes_processo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  tipo_autorizacao TEXT NOT NULL CHECK (tipo_autorizacao IN ('compra_direta', 'selecao_fornecedores')),
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  protocolo TEXT NOT NULL,
  usuario_gerador_id UUID NOT NULL REFERENCES auth.users(id),
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.autorizacoes_processo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para autorizacoes_processo
CREATE POLICY "Internal users can view autorizacoes"
  ON public.autorizacoes_processo
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Internal users can create autorizacoes"
  ON public.autorizacoes_processo
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Responsaveis legais can delete autorizacoes"
  ON public.autorizacoes_processo
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.responsavel_legal = true
    )
  );

-- Criar índice para melhorar performance
CREATE INDEX idx_autorizacoes_cotacao ON public.autorizacoes_processo(cotacao_id);
CREATE INDEX idx_autorizacoes_tipo ON public.autorizacoes_processo(tipo_autorizacao);