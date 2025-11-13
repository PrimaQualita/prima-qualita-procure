-- Adicionar políticas RLS para anexos_cotacao_fornecedor
-- Permitir inserção de anexos pelos usuários autenticados
CREATE POLICY "Usuários autenticados podem inserir anexos de cotação"
ON anexos_cotacao_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permitir visualização de anexos pelos usuários autenticados
CREATE POLICY "Usuários autenticados podem visualizar anexos de cotação"
ON anexos_cotacao_fornecedor
FOR SELECT
TO authenticated
USING (true);

-- Permitir atualização de anexos pelos usuários autenticados
CREATE POLICY "Usuários autenticados podem atualizar anexos de cotação"
ON anexos_cotacao_fornecedor
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Permitir exclusão de anexos pelos usuários autenticados
CREATE POLICY "Usuários autenticados podem deletar anexos de cotação"
ON anexos_cotacao_fornecedor
FOR DELETE
TO authenticated
USING (true);