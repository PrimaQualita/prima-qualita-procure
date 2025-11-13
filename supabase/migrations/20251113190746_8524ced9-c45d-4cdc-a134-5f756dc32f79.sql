-- Remover política restritiva existente
DROP POLICY IF EXISTS "Responsáveis legais podem deletar encaminhamentos" ON public.encaminhamentos_processo;

-- Criar política que permite usuários autenticados deletarem seus próprios encaminhamentos
CREATE POLICY "Usuários autenticados podem deletar próprios encaminhamentos"
  ON public.encaminhamentos_processo
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
    )
  );