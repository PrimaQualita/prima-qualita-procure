-- Criar tabela para respostas de recursos
CREATE TABLE IF NOT EXISTS public.respostas_recursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurso_id UUID NOT NULL REFERENCES public.recursos_fornecedor(id) ON DELETE CASCADE,
  decisao TEXT NOT NULL CHECK (decisao IN ('provimento', 'negado')),
  texto_resposta TEXT NOT NULL,
  url_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  protocolo TEXT NOT NULL UNIQUE,
  usuario_respondeu_id UUID REFERENCES auth.users(id),
  data_resposta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.respostas_recursos ENABLE ROW LEVEL SECURITY;

-- Política para gestores/colaboradores verem todas as respostas
CREATE POLICY "Authenticated users can view respostas recursos"
ON public.respostas_recursos
FOR SELECT
TO authenticated
USING (true);

-- Política para usuários autenticados inserirem respostas
CREATE POLICY "Authenticated users can insert respostas recursos"
ON public.respostas_recursos
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Índices para performance
CREATE INDEX idx_respostas_recursos_recurso ON public.respostas_recursos(recurso_id);
CREATE INDEX idx_respostas_recursos_protocolo ON public.respostas_recursos(protocolo);