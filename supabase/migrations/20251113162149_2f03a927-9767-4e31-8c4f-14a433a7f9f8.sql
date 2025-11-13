-- Adicionar novo valor 'compliance' ao enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'compliance';

-- Adicionar coluna compliance na tabela profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS compliance BOOLEAN DEFAULT false;

-- Adicionar coluna para marcar se foi enviado ao compliance na tabela cotacoes_precos
ALTER TABLE public.cotacoes_precos
ADD COLUMN IF NOT EXISTS enviado_compliance BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_envio_compliance TIMESTAMP WITH TIME ZONE;

-- Criar tabela para armazenar planilhas consolidadas geradas
CREATE TABLE IF NOT EXISTS public.planilhas_consolidadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  usuario_gerador_id UUID NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planilhas_consolidadas ENABLE ROW LEVEL SECURITY;

-- RLS policies para planilhas_consolidadas
CREATE POLICY "Internal users can create planilhas"
ON public.planilhas_consolidadas
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can view planilhas"
ON public.planilhas_consolidadas
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can delete planilhas"
ON public.planilhas_consolidadas
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);