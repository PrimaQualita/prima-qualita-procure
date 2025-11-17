-- Criar tabela para armazenar snapshots de documentos de fornecedores em processos finalizados
CREATE TABLE IF NOT EXISTS public.documentos_processo_finalizado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_validade DATE,
  data_emissao DATE,
  em_vigor BOOLEAN DEFAULT true,
  data_snapshot TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.documentos_processo_finalizado ENABLE ROW LEVEL SECURITY;

-- Policy para usuários internos visualizarem documentos de processos finalizados
CREATE POLICY "Internal users can view documentos processo finalizado"
ON public.documentos_processo_finalizado
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Policy para sistema inserir documentos ao finalizar processo
CREATE POLICY "System can insert documentos processo finalizado"
ON public.documentos_processo_finalizado
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_documentos_processo_finalizado_cotacao 
  ON public.documentos_processo_finalizado(cotacao_id);
CREATE INDEX IF NOT EXISTS idx_documentos_processo_finalizado_fornecedor 
  ON public.documentos_processo_finalizado(fornecedor_id);

COMMENT ON TABLE public.documentos_processo_finalizado IS 'Armazena snapshots dos documentos dos fornecedores no momento da finalização do processo. Estes documentos não são afetados por atualizações futuras do fornecedor.';