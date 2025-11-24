-- Remover políticas antigas conflitantes
DROP POLICY IF EXISTS "Public can verify selecao propostas by protocolo" ON selecao_propostas_fornecedor;
DROP POLICY IF EXISTS "Public can verify selection proposals by protocolo" ON selecao_propostas_fornecedor;

-- Criar política nova que permite acesso total anônimo para verificação
CREATE POLICY "Anyone can verify propostas by protocolo"
ON selecao_propostas_fornecedor
FOR SELECT
TO anon, authenticated
USING (protocolo IS NOT NULL);