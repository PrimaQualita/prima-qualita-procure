
-- Tabela de notificações de documentos do processo (requisição e autorização)
CREATE TABLE public.notificacoes_documentos_processo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_compra_id UUID NOT NULL REFERENCES public.processos_compras(id) ON DELETE CASCADE,
  tipo_notificacao TEXT NOT NULL CHECK (tipo_notificacao IN ('requisicao', 'autorizacao_despesa')),
  destinatario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  remetente_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  numero_processo TEXT NOT NULL,
  objeto_processo TEXT NOT NULL,
  contrato_gestao_nome TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  atendida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacoes_documentos_processo ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem ver suas próprias notificações
CREATE POLICY "Usuarios podem ver suas notificacoes"
  ON public.notificacoes_documentos_processo
  FOR SELECT
  TO authenticated
  USING (destinatario_id = auth.uid());

-- Política: usuários autenticados podem inserir notificações
CREATE POLICY "Usuarios podem criar notificacoes"
  ON public.notificacoes_documentos_processo
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Política: destinatários podem atualizar suas notificações (marcar como lida/atendida)
CREATE POLICY "Destinatarios podem atualizar suas notificacoes"
  ON public.notificacoes_documentos_processo
  FOR UPDATE
  TO authenticated
  USING (destinatario_id = auth.uid());
