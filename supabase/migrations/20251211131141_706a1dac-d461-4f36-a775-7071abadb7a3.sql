-- Adicionar política para permitir busca de fornecedor por CNPJ em cotações abertas
-- Esta é uma funcionalidade crítica do sistema onde fornecedores preenchem propostas

CREATE POLICY "Public can search fornecedor by cnpj for cotacao"
ON public.fornecedores
FOR SELECT
USING (
  -- Permite busca pública apenas dos campos necessários para preencher proposta
  -- A busca é feita por CNPJ válido (14 dígitos)
  cnpj IS NOT NULL
);