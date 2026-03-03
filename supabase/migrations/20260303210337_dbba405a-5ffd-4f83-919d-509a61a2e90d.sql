DROP POLICY IF EXISTS "Usuarios podem ver suas notificacoes" ON public.notificacoes_documentos_processo;

CREATE POLICY "Usuarios autorizados podem ver notificacoes"
ON public.notificacoes_documentos_processo
FOR SELECT
TO authenticated
USING (
  (destinatario_id = auth.uid())
  OR (
    tipo_notificacao = 'requisicao'
    AND EXISTS (
      SELECT 1
      FROM public.gerentes_contratos_gestao gc
      JOIN public.processos_compras pc
        ON pc.contrato_gestao_id = gc.contrato_gestao_id
      WHERE gc.usuario_id = auth.uid()
        AND pc.id = notificacoes_documentos_processo.processo_compra_id
    )
  )
  OR (
    tipo_notificacao = 'autorizacao_despesa'
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.superintendente_executivo = true
        AND COALESCE(p.ativo, true) = true
    )
  )
);