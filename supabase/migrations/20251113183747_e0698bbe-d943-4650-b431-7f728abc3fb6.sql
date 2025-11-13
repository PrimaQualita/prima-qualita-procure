-- Criar tabela para encaminhamentos
CREATE TABLE IF NOT EXISTS public.encaminhamentos_processo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  processo_numero TEXT NOT NULL,
  protocolo TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  gerado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.encaminhamentos_processo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários autenticados podem visualizar encaminhamentos"
ON public.encaminhamentos_processo
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem criar encaminhamentos"
ON public.encaminhamentos_processo
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Responsáveis legais podem deletar encaminhamentos"
ON public.encaminhamentos_processo
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.responsavel_legal = true
  )
);