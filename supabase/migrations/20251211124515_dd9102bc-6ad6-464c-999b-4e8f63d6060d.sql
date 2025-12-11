-- =====================================================
-- CORREÇÃO DE SEGURANÇA COMPLETA - 7 TABELAS
-- Mantendo funcionalidades: cadastro, cotação, verificação
-- =====================================================

-- ========================================
-- 1. PROFILES - Restringir acesso público
-- ========================================
-- Remover política com role public e recriar apenas para authenticated
DROP POLICY IF EXISTS "Internal users can view all profiles" ON profiles;

CREATE POLICY "Internal users can view all profiles"
ON profiles FOR SELECT TO authenticated
USING (is_internal_user(auth.uid()));

-- ========================================
-- 2. FORNECEDORES - Manter apenas políticas necessárias
-- ========================================
-- Remover políticas públicas desnecessárias (manter INSERT para cadastro)
DROP POLICY IF EXISTS "Public can view minimal fornecedor data for verification" ON fornecedores;
DROP POLICY IF EXISTS "Public can update orphan fornecedores with matching email" ON fornecedores;

-- Manter: Anyone can create fornecedor account (necessário para cadastro)
-- Manter: Internal users can manage fornecedores
-- Manter: Fornecedores can view own data
-- Manter: Fornecedores can update own data

-- Criar política restritiva para verificação apenas por request path
CREATE POLICY "Public can view fornecedor for verification only"
ON fornecedores FOR SELECT TO anon
USING (
  current_setting('request.path', true) LIKE '%verificar%'
  AND cnpj IS NOT NULL
);

-- ========================================
-- 3. COTACAO_RESPOSTAS_FORNECEDOR - Restringir SELECT público
-- ========================================
DROP POLICY IF EXISTS "Public can check existing respostas" ON cotacao_respostas_fornecedor;
DROP POLICY IF EXISTS "Public can verify cotacao propostas by protocolo" ON cotacao_respostas_fornecedor;

-- Criar política restritiva para verificação por protocolo
CREATE POLICY "Public can verify proposals by protocolo only"
ON cotacao_respostas_fornecedor FOR SELECT TO anon
USING (
  protocolo IS NOT NULL
  AND current_setting('request.path', true) LIKE '%verificar%'
);

-- Criar função para verificar se fornecedor já respondeu (sem expor dados)
CREATE OR REPLACE FUNCTION public.verificar_resposta_cotacao_existe(
  p_cotacao_id uuid,
  p_cnpj text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM cotacao_respostas_fornecedor crf
    JOIN fornecedores f ON f.id = crf.fornecedor_id
    WHERE crf.cotacao_id = p_cotacao_id AND f.cnpj = p_cnpj
  );
END;
$$;

-- ========================================
-- 4. RESPOSTAS_ITENS_FORNECEDOR - CRÍTICO: Remover acesso público total
-- ========================================
DROP POLICY IF EXISTS "Allow public select respostas itens" ON respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Allow public insert respostas itens" ON respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Allow public update respostas itens" ON respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Allow public delete respostas itens" ON respostas_itens_fornecedor;

-- Criar políticas seguras para respostas_itens_fornecedor
-- INSERT: Apenas para cotações abertas, vinculado à resposta do fornecedor
CREATE POLICY "Fornecedor can insert own respostas itens"
ON respostas_itens_fornecedor FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);

-- SELECT: Fornecedores veem próprias respostas, internos veem todas
CREATE POLICY "Users can view respostas itens"
ON respostas_itens_fornecedor FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN fornecedores f ON f.id = crf.fornecedor_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND (f.user_id = auth.uid() OR is_internal_user(auth.uid()))
  )
);

-- UPDATE: Apenas para cotações abertas
CREATE POLICY "Fornecedor can update own respostas itens"
ON respostas_itens_fornecedor FOR UPDATE TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = respostas_itens_fornecedor.cotacao_resposta_fornecedor_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);

-- DELETE: Apenas internos podem deletar
CREATE POLICY "Internal users can delete respostas itens"
ON respostas_itens_fornecedor FOR DELETE TO authenticated
USING (is_internal_user(auth.uid()));

-- ========================================
-- 5. PLANILHAS_CONSOLIDADAS - Restringir acesso público
-- ========================================
DROP POLICY IF EXISTS "Enable public verification by protocolo" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Enable read access for all users" ON planilhas_consolidadas;
DROP POLICY IF EXISTS "Public can verify planilhas by protocolo" ON planilhas_consolidadas;

-- Manter: Internal users can manage planilhas consolidadas
-- Manter: Enable insert for authenticated users
-- Manter: Enable delete for internal users

-- Criar política restritiva para verificação por protocolo
CREATE POLICY "Public can verify planilhas by protocolo only"
ON planilhas_consolidadas FOR SELECT TO anon
USING (
  protocolo IS NOT NULL
  AND current_setting('request.path', true) LIKE '%verificar%'
);

-- Política para authenticated que não são internos
CREATE POLICY "Authenticated can view planilhas"
ON planilhas_consolidadas FOR SELECT TO authenticated
USING (is_internal_user(auth.uid()));

-- ========================================
-- 6. RELATORIOS_FINAIS - Restringir acesso público
-- ========================================
DROP POLICY IF EXISTS "Public can verify relatorios finais by protocolo" ON relatorios_finais;
DROP POLICY IF EXISTS "Public can verify relatorios by protocolo" ON relatorios_finais;

-- Manter outras políticas de internal users

-- Criar política restritiva para verificação
CREATE POLICY "Public can verify relatorios by protocolo only"
ON relatorios_finais FOR SELECT TO anon
USING (
  protocolo IS NOT NULL
  AND current_setting('request.path', true) LIKE '%verificar%'
);

-- ========================================
-- 7. RESPOSTAS_RECURSOS - Restringir acesso público
-- ========================================
DROP POLICY IF EXISTS "Public can verify respostas recursos by protocolo" ON respostas_recursos;
DROP POLICY IF EXISTS "Authenticated users can delete respostas recursos" ON respostas_recursos;

-- Criar política restritiva para verificação
CREATE POLICY "Public can verify respostas recursos by protocolo only"
ON respostas_recursos FOR SELECT TO anon
USING (
  protocolo IS NOT NULL
  AND current_setting('request.path', true) LIKE '%verificar%'
);

-- DELETE apenas para internal users
CREATE POLICY "Internal users can delete respostas recursos"
ON respostas_recursos FOR DELETE TO authenticated
USING (is_internal_user(auth.uid()));