-- Criar tabela para armazenar anexos de e-mails de cotações
CREATE TABLE public.emails_cotacao_anexados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tamanho_arquivo BIGINT NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  usuario_upload_id UUID NOT NULL REFERENCES auth.users(id),
  data_upload TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.emails_cotacao_anexados ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para emails_cotacao_anexados
CREATE POLICY "Internal users can view emails cotacao"
  ON public.emails_cotacao_anexados
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Internal users can create emails cotacao"
  ON public.emails_cotacao_anexados
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Internal users can delete emails cotacao"
  ON public.emails_cotacao_anexados
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Criar índice para melhorar performance
CREATE INDEX idx_emails_cotacao_cotacao ON public.emails_cotacao_anexados(cotacao_id);