
-- Permitir que todos os usuários internos (profiles) visualizem notificações no BI
CREATE POLICY "Usuarios internos podem ver todas notificacoes para BI"
ON public.notificacoes_documentos_processo
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);

-- Permitir que todos os usuários internos visualizem solicitações de autorização
CREATE POLICY "Usuarios internos podem ver solicitacoes autorizacao"
ON public.solicitacoes_autorizacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);
