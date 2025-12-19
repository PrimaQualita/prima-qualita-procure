-- Tabela para armazenar protocolos de documentos de processo (requisição, capa, etc.)
CREATE TABLE public.protocolos_documentos_processo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocolo TEXT NOT NULL UNIQUE,
  tipo_documento TEXT NOT NULL,
  processo_compra_id UUID REFERENCES public.processos_compras(id) ON DELETE CASCADE,
  anexo_id UUID REFERENCES public.anexos_processo_compra(id) ON DELETE CASCADE,
  nome_arquivo TEXT,
  url_arquivo TEXT,
  responsavel_nome TEXT,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.protocolos_documentos_processo ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Qualquer pessoa pode verificar protocolo" 
ON public.protocolos_documentos_processo 
FOR SELECT 
USING (true);

CREATE POLICY "Usuários internos podem inserir" 
ON public.protocolos_documentos_processo 
FOR INSERT 
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Usuários internos podem atualizar" 
ON public.protocolos_documentos_processo 
FOR UPDATE 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Usuários internos podem deletar" 
ON public.protocolos_documentos_processo 
FOR DELETE 
USING (public.is_internal_user(auth.uid()));