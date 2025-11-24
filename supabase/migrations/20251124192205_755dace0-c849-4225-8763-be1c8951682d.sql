-- Garantir RLS policy para leitura pública de itens de propostas de seleção
DROP POLICY IF EXISTS "Public can view selecao respostas itens" ON selecao_respostas_itens_fornecedor;

CREATE POLICY "Public can view selecao respostas itens"
ON selecao_respostas_itens_fornecedor
FOR SELECT
USING (true);