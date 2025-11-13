-- Permitir acesso público de leitura em encaminhamentos_processo para verificação
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar encaminhamentos" ON public.encaminhamentos_processo;

CREATE POLICY "Public can verify encaminhamentos by protocolo" ON public.encaminhamentos_processo
  FOR SELECT USING (true);

-- Garantir que as políticas de autorizacoes_processo permitam acesso público
DROP POLICY IF EXISTS "Public can verify autorizacoes by protocolo" ON public.autorizacoes_processo;

CREATE POLICY "Public can verify autorizacoes by protocolo" ON public.autorizacoes_processo
  FOR SELECT USING (true);

-- Garantir que as políticas de relatorios_finais permitam acesso público  
DROP POLICY IF EXISTS "Public can verify relatorios finais by protocolo" ON public.relatorios_finais;

CREATE POLICY "Public can verify relatorios finais by protocolo" ON public.relatorios_finais
  FOR SELECT USING (true);