-- Criar tabela para relatórios finais
CREATE TABLE IF NOT EXISTS public.relatorios_finais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  protocolo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  usuario_gerador_id UUID NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.relatorios_finais ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can view relatorios"
ON public.relatorios_finais
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can create relatorios"
ON public.relatorios_finais
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Índice para busca rápida
CREATE INDEX idx_relatorios_finais_cotacao ON public.relatorios_finais(cotacao_id);
CREATE INDEX idx_relatorios_finais_protocolo ON public.relatorios_finais(protocolo);