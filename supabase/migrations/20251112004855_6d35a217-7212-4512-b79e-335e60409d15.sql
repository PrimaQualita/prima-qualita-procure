-- Fix overly permissive RLS policies on cotacao_respostas_fornecedor and fornecedores

-- 1. Fix cotacao_respostas_fornecedor: Restrict public access to only OPEN cotacoes
DROP POLICY IF EXISTS "Public can check existing respostas" ON cotacao_respostas_fornecedor;

CREATE POLICY "Public can check respostas for open cotacoes only"
ON cotacao_respostas_fornecedor
FOR SELECT
TO public
USING (
  -- Only allow viewing responses for quotations that are:
  -- 1. Currently open for submissions
  -- 2. Within the deadline
  EXISTS (
    SELECT 1 
    FROM cotacoes_precos 
    WHERE cotacoes_precos.id = cotacao_respostas_fornecedor.cotacao_id 
    AND cotacoes_precos.status_cotacao = 'em_aberto'
    AND cotacoes_precos.data_limite_resposta > now()
  )
);

-- 2. Fix fornecedores: Restrict public access to only APPROVED suppliers
DROP POLICY IF EXISTS "Public can view fornecedores by CNPJ" ON fornecedores;

CREATE POLICY "Public can view approved fornecedores only"
ON fornecedores
FOR SELECT
TO public
USING (
  -- Only allow viewing suppliers that have been approved
  -- This prevents exposing pending/rejected supplier data
  status_aprovacao = 'aprovado'
);

COMMENT ON POLICY "Public can check respostas for open cotacoes only" ON cotacao_respostas_fornecedor IS 
'Restricts public access to only responses for currently open quotations within deadline. Prevents viewing historical quotation data.';

COMMENT ON POLICY "Public can view approved fornecedores only" ON fornecedores IS 
'Restricts public access to only approved suppliers. Prevents exposing pending or rejected supplier registration data.';