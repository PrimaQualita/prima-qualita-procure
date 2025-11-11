-- Permitir que usuários não autenticados criem respostas de cotação
DROP POLICY IF EXISTS "Fornecedores can create own respostas" ON cotacao_respostas_fornecedor;

CREATE POLICY "Anyone can create cotacao respostas"
ON cotacao_respostas_fornecedor
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cotacoes_precos
    WHERE id = cotacao_id
    AND status_cotacao = 'em_aberto'
    AND data_limite_resposta > NOW()
  )
);

-- Permitir que usuários não autenticados criem respostas de itens
DROP POLICY IF EXISTS "Fornecedores can manage own respostas itens" ON respostas_itens_fornecedor;

CREATE POLICY "Anyone can create respostas itens"
ON respostas_itens_fornecedor
FOR INSERT
TO public
WITH CHECK (true);