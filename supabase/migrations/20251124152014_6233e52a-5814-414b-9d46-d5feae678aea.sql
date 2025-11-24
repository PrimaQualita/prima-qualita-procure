-- Permitir acesso público (não autenticado) para visualizar seleções
CREATE POLICY "Public can view selecoes for participation" 
ON selecoes_fornecedores 
FOR SELECT 
USING (true);

-- Permitir acesso público para visualizar processos relacionados às seleções
CREATE POLICY "Public can view processos for selecoes" 
ON processos_compras 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM selecoes_fornecedores
    WHERE selecoes_fornecedores.processo_compra_id = processos_compras.id
  )
);

-- Permitir acesso público para visualizar lotes de cotações relacionadas a seleções
CREATE POLICY "Public can view lotes for selecao cotacoes" 
ON lotes_cotacao 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM selecoes_fornecedores
    WHERE selecoes_fornecedores.cotacao_relacionada_id = lotes_cotacao.cotacao_id
  )
);

-- Permitir criação de propostas por usuários não autenticados
CREATE POLICY "Anyone can create selecao propostas" 
ON selecao_propostas_fornecedor 
FOR INSERT 
WITH CHECK (true);

-- Permitir criação de respostas de itens por usuários não autenticados
CREATE POLICY "Anyone can create selecao respostas itens" 
ON selecao_respostas_itens_fornecedor 
FOR INSERT 
WITH CHECK (true);

-- Permitir fornecedores visualizarem suas próprias propostas (para quando se cadastrarem depois)
CREATE POLICY "Fornecedores can view own selecao propostas" 
ON selecao_propostas_fornecedor 
FOR SELECT 
USING (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Permitir visualização pública de propostas para verificação de duplicidade
CREATE POLICY "Public can check existing selecao propostas" 
ON selecao_propostas_fornecedor 
FOR SELECT 
USING (true);