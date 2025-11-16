-- Criar tabela para solicitações de autorização ao responsável legal
CREATE TABLE public.solicitacoes_autorizacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  processo_numero TEXT NOT NULL,
  solicitante_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'autorizada', 'rejeitada')),
  data_solicitacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_resposta TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.solicitacoes_autorizacao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
-- Usuários internos podem criar solicitações
CREATE POLICY "Internal users can create solicitacoes"
ON public.solicitacoes_autorizacao
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Responsáveis legais podem ver solicitações
CREATE POLICY "Responsaveis legais can view solicitacoes"
ON public.solicitacoes_autorizacao
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.responsavel_legal = true
  )
);

-- Solicitantes podem ver suas próprias solicitações
CREATE POLICY "Solicitantes can view own solicitacoes"
ON public.solicitacoes_autorizacao
FOR SELECT
TO authenticated
USING (solicitante_id = auth.uid());

-- Responsáveis legais podem atualizar solicitações
CREATE POLICY "Responsaveis legais can update solicitacoes"
ON public.solicitacoes_autorizacao
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.responsavel_legal = true
  )
);

-- Criar índice para melhor performance
CREATE INDEX idx_solicitacoes_autorizacao_status ON public.solicitacoes_autorizacao(status);
CREATE INDEX idx_solicitacoes_autorizacao_cotacao ON public.solicitacoes_autorizacao(cotacao_id);