-- Remover a política que causa recursão infinita
DROP POLICY IF EXISTS "Fornecedores can view cotacoes where they have proposta" ON cotacoes_precos;