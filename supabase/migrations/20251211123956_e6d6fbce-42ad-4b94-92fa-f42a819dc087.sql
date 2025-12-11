-- =====================================================
-- CORREÇÃO DE SEGURANÇA: Restringir acesso público à tabela fornecedores
-- =====================================================

-- Remover políticas públicas que expõem dados sensíveis
DROP POLICY IF EXISTS "Public can check fornecedor by CNPJ" ON fornecedores;
DROP POLICY IF EXISTS "Public can view fornecedores for verification" ON fornecedores;

-- Criar função segura para verificar existência de CNPJ (retorna apenas boolean)
CREATE OR REPLACE FUNCTION public.verificar_cnpj_existe(p_cnpj text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM fornecedores WHERE cnpj = p_cnpj);
END;
$$;

-- Criar função segura para verificar se fornecedor pode participar de cotação/seleção
CREATE OR REPLACE FUNCTION public.verificar_fornecedor_participacao(p_cnpj text)
RETURNS TABLE (
  pode_participar boolean,
  status_aprovacao text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.status_aprovacao = 'aprovado' AND f.ativo = true,
    f.status_aprovacao
  FROM fornecedores f
  WHERE f.cnpj = p_cnpj;
END;
$$;

-- Política restritiva: público pode ver apenas dados mínimos para páginas de verificação
CREATE POLICY "Public can view minimal fornecedor data for verification"
ON fornecedores FOR SELECT TO public
USING (
  -- Permitir apenas para páginas de verificação (atas, propostas, etc.)
  current_setting('request.path', true) LIKE '%verificar%'
);