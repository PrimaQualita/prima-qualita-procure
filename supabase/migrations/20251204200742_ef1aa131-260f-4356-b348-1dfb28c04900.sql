-- Criar tabela para armazenar documentos antigos (certidões atualizadas)
CREATE TABLE public.documentos_antigos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_emissao DATE,
  data_validade DATE,
  data_upload_original TIMESTAMP WITH TIME ZONE,
  data_arquivamento TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hash_arquivo TEXT,
  -- Array de processos onde este documento foi usado (cotações e seleções)
  processos_vinculados UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar índices para buscas eficientes
CREATE INDEX idx_documentos_antigos_fornecedor ON public.documentos_antigos(fornecedor_id);
CREATE INDEX idx_documentos_antigos_tipo ON public.documentos_antigos(tipo_documento);
CREATE INDEX idx_documentos_antigos_hash ON public.documentos_antigos(hash_arquivo);

-- Habilitar RLS
ALTER TABLE public.documentos_antigos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can manage documentos antigos"
ON public.documentos_antigos
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Fornecedores can view own documentos antigos"
ON public.documentos_antigos
FOR SELECT
USING (fornecedor_id IN (
  SELECT id FROM fornecedores WHERE user_id = auth.uid()
));

-- Comentário na tabela
COMMENT ON TABLE public.documentos_antigos IS 'Armazena certidões de fornecedores que foram atualizadas, mantendo referências aos processos onde foram usadas';