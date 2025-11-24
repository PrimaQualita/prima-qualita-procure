-- Adicionar política para permitir visualização pública dos itens de propostas de seleção
-- Necessário para geração de PDF por usuários autenticados internos
DROP POLICY IF EXISTS "Users can view selecao itens for PDF generation" ON selecao_respostas_itens_fornecedor;

CREATE POLICY "Users can view selecao itens for PDF generation"
ON selecao_respostas_itens_fornecedor
FOR SELECT
TO authenticated
USING (true);