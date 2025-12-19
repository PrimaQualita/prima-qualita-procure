-- Tabela para armazenar encaminhamentos para contabilidade
CREATE TABLE public.encaminhamentos_contabilidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  processo_numero TEXT NOT NULL,
  objeto_processo TEXT NOT NULL,
  fornecedores_vencedores JSONB NOT NULL DEFAULT '[]'::jsonb,
  protocolo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  storage_path TEXT,
  usuario_gerador_id UUID REFERENCES auth.users(id),
  usuario_gerador_nome TEXT NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  enviado_contabilidade BOOLEAN DEFAULT false,
  data_envio_contabilidade TIMESTAMP WITH TIME ZONE,
  respondido_contabilidade BOOLEAN DEFAULT false,
  data_resposta_contabilidade TIMESTAMP WITH TIME ZONE,
  resposta_contabilidade TEXT,
  usuario_resposta_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Adicionar campo gerente_financeiro na tabela profiles se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'gerente_financeiro'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN gerente_financeiro BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Habilitar RLS
ALTER TABLE public.encaminhamentos_contabilidade ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Internal users can manage encaminhamentos contabilidade"
  ON public.encaminhamentos_contabilidade
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Public can verify encaminhamentos by protocolo"
  ON public.encaminhamentos_contabilidade
  FOR SELECT
  USING (protocolo IS NOT NULL AND current_setting('request.path'::text, true) ~~ '%verificar%'::text);

-- Índices para performance
CREATE INDEX idx_encaminhamentos_contabilidade_cotacao ON public.encaminhamentos_contabilidade(cotacao_id);
CREATE INDEX idx_encaminhamentos_contabilidade_protocolo ON public.encaminhamentos_contabilidade(protocolo);
CREATE INDEX idx_encaminhamentos_contabilidade_enviado ON public.encaminhamentos_contabilidade(enviado_contabilidade);
CREATE INDEX idx_encaminhamentos_contabilidade_respondido ON public.encaminhamentos_contabilidade(respondido_contabilidade);