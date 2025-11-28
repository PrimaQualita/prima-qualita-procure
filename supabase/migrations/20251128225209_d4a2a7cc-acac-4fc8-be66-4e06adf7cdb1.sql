-- Criar tabela para solicitações de autorização de seleção de fornecedores
CREATE TABLE IF NOT EXISTS public.solicitacoes_autorizacao_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cotacao_id UUID NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  processo_numero TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  data_solicitacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  data_resposta TIMESTAMP WITH TIME ZONE,
  solicitante_id UUID REFERENCES auth.users(id),
  responsavel_legal_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.solicitacoes_autorizacao_selecao ENABLE ROW LEVEL SECURITY;

-- Policy para usuários autenticados visualizarem todas as solicitações
CREATE POLICY "Authenticated users can view all solicitacoes autorizacao selecao"
  ON public.solicitacoes_autorizacao_selecao
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy para usuários autenticados criarem solicitações
CREATE POLICY "Authenticated users can create solicitacoes autorizacao selecao"
  ON public.solicitacoes_autorizacao_selecao
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy para atualizar solicitações
CREATE POLICY "Authenticated users can update solicitacoes autorizacao selecao"
  ON public.solicitacoes_autorizacao_selecao
  FOR UPDATE
  TO authenticated
  USING (true);

-- Índices para melhorar performance
CREATE INDEX idx_solicitacoes_autorizacao_selecao_status ON public.solicitacoes_autorizacao_selecao(status);
CREATE INDEX idx_solicitacoes_autorizacao_selecao_responsavel ON public.solicitacoes_autorizacao_selecao(responsavel_legal_id);
CREATE INDEX idx_solicitacoes_autorizacao_selecao_cotacao ON public.solicitacoes_autorizacao_selecao(cotacao_id);