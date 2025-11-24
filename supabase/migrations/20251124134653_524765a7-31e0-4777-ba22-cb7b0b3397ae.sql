-- Criar tabela para anexos de seleção
CREATE TABLE IF NOT EXISTS public.anexos_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('aviso', 'edital')),
  url_arquivo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  data_upload TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_upload_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.anexos_selecao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para usuários internos
CREATE POLICY "Internal users can manage anexos selecao"
  ON public.anexos_selecao
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );

-- Política para fornecedores visualizarem anexos das seleções que participam
CREATE POLICY "Fornecedores can view anexos of their selecoes"
  ON public.anexos_selecao
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.selecao_fornecedor_convites sfc
      JOIN public.fornecedores f ON f.id = sfc.fornecedor_id
      WHERE sfc.selecao_id = anexos_selecao.selecao_id
        AND f.user_id = auth.uid()
    )
  );

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_anexos_selecao_selecao_id ON public.anexos_selecao(selecao_id);
CREATE INDEX IF NOT EXISTS idx_anexos_selecao_tipo_documento ON public.anexos_selecao(tipo_documento);