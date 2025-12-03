-- Criar tabela para armazenar planilhas de habilitação
CREATE TABLE public.planilhas_habilitacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  protocolo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  storage_path TEXT,
  usuario_gerador_id UUID NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.planilhas_habilitacao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can manage planilhas habilitacao"
ON public.planilhas_habilitacao
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Public can verify planilhas habilitacao by protocolo"
ON public.planilhas_habilitacao
FOR SELECT
USING (protocolo IS NOT NULL);

-- Índice para buscas
CREATE INDEX idx_planilhas_habilitacao_cotacao ON public.planilhas_habilitacao(cotacao_id);
CREATE INDEX idx_planilhas_habilitacao_protocolo ON public.planilhas_habilitacao(protocolo);