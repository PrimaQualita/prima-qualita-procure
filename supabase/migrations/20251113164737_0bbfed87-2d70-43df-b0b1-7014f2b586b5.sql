-- Criar tabela para armazenar planilhas consolidadas geradas
CREATE TABLE IF NOT EXISTS public.planilhas_consolidadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_gerador_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar coluna enviado_compliance em cotacoes_precos
ALTER TABLE public.cotacoes_precos 
ADD COLUMN IF NOT EXISTS enviado_compliance BOOLEAN DEFAULT false;

-- Enable RLS
ALTER TABLE public.planilhas_consolidadas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para planilhas_consolidadas
CREATE POLICY "Authenticated users can view planilhas"
ON public.planilhas_consolidadas
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create planilhas"
ON public.planilhas_consolidadas
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete planilhas"
ON public.planilhas_consolidadas
FOR DELETE
USING (auth.role() = 'authenticated');