
-- CORREÇÃO FINAL DE SEGURANÇA

-- FORNECEDORES - Garantir que não tem políticas públicas abertas
DROP POLICY IF EXISTS "Anyone can view fornecedores" ON public.fornecedores;
DROP POLICY IF EXISTS "Public can view fornecedores for selecao" ON public.fornecedores;

-- COTACAO_RESPOSTAS_FORNECEDOR - Remover qualquer política pública restante
DROP POLICY IF EXISTS "Anyone can verify propostas by protocolo" ON public.cotacao_respostas_fornecedor;
DROP POLICY IF EXISTS "Public can view cotacao respostas" ON public.cotacao_respostas_fornecedor;

-- RELATORIOS_FINAIS - Remover acesso público geral
DROP POLICY IF EXISTS "Public can view relatorios" ON public.relatorios_finais;
DROP POLICY IF EXISTS "Anyone can view relatorios" ON public.relatorios_finais;

-- RESPOSTAS_RECURSOS - Restringir acesso
DROP POLICY IF EXISTS "Public can view respostas recursos" ON public.respostas_recursos;
DROP POLICY IF EXISTS "Anyone can view respostas recursos" ON public.respostas_recursos;
DROP POLICY IF EXISTS "Authenticated users can view respostas recursos" ON public.respostas_recursos;

-- Recriar política restrita para respostas_recursos
CREATE POLICY "Internal users can manage respostas recursos"
ON public.respostas_recursos
FOR ALL
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Fornecedores can view own respostas recursos"
ON public.respostas_recursos
FOR SELECT
USING (
  recurso_id IN (
    SELECT rf.id FROM public.recursos_fornecedor rf
    JOIN public.fornecedores f ON f.id = rf.fornecedor_id
    WHERE f.user_id = auth.uid()
  )
);

-- PLANILHAS_CONSOLIDADAS - Já corrigido, remover políticas públicas extras
DROP POLICY IF EXISTS "Public can view planilhas" ON public.planilhas_consolidadas;

-- PLANILHAS_HABILITACAO - Remover acesso público geral
DROP POLICY IF EXISTS "Public can view planilhas habilitacao" ON public.planilhas_habilitacao;
DROP POLICY IF EXISTS "Anyone can view planilhas habilitacao" ON public.planilhas_habilitacao;
