
-- =====================================================
-- CORREÇÃO DE SEGURANÇA - CONTINUAÇÃO
-- =====================================================

-- 4. ENCAMINHAMENTOS_PROCESSO - Drop e recriar
DROP POLICY IF EXISTS "Public can verify encaminhamentos by protocolo" ON public.encaminhamentos_processo;
DROP POLICY IF EXISTS "Internal users can manage encaminhamentos" ON public.encaminhamentos_processo;

CREATE POLICY "Internal users can manage encaminhamentos"
ON public.encaminhamentos_processo
FOR ALL
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Public can verify encaminhamentos by protocolo"
ON public.encaminhamentos_processo
FOR SELECT
USING (
  protocolo IS NOT NULL 
  AND current_setting('request.path', true) LIKE '%verificar%'
);

-- 5. PLANILHAS_CONSOLIDADAS - Drop e recriar
DROP POLICY IF EXISTS "Public can view planilhas consolidadas" ON public.planilhas_consolidadas;
DROP POLICY IF EXISTS "Anyone can view planilhas consolidadas" ON public.planilhas_consolidadas;
DROP POLICY IF EXISTS "Internal users can manage planilhas consolidadas" ON public.planilhas_consolidadas;

CREATE POLICY "Internal users can manage planilhas consolidadas"
ON public.planilhas_consolidadas
FOR ALL
USING (public.is_internal_user(auth.uid()));

-- 6. AUTORIZACOES_PROCESSO - Drop e recriar
DROP POLICY IF EXISTS "Public can view autorizacoes" ON public.autorizacoes_processo;
DROP POLICY IF EXISTS "Anyone can view autorizacoes" ON public.autorizacoes_processo;
DROP POLICY IF EXISTS "Internal users can manage autorizacoes" ON public.autorizacoes_processo;
DROP POLICY IF EXISTS "Public can verify autorizacoes by protocolo" ON public.autorizacoes_processo;

CREATE POLICY "Internal users can manage autorizacoes"
ON public.autorizacoes_processo
FOR ALL
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Public can verify autorizacoes by protocolo"
ON public.autorizacoes_processo
FOR SELECT
USING (
  protocolo IS NOT NULL 
  AND current_setting('request.path', true) LIKE '%verificar%'
);

-- 7. RELATORIOS_FINAIS - Drop e recriar
DROP POLICY IF EXISTS "Public can view relatorios finais" ON public.relatorios_finais;
DROP POLICY IF EXISTS "Anyone can view relatorios finais" ON public.relatorios_finais;
DROP POLICY IF EXISTS "Internal users can manage relatorios finais" ON public.relatorios_finais;
DROP POLICY IF EXISTS "Public can verify relatorios by protocolo" ON public.relatorios_finais;

CREATE POLICY "Internal users can manage relatorios finais"
ON public.relatorios_finais
FOR ALL
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Public can verify relatorios by protocolo"
ON public.relatorios_finais
FOR SELECT
USING (
  protocolo IS NOT NULL 
  AND current_setting('request.path', true) LIKE '%verificar%'
);
