
-- GRANT permissões básicas para a tabela respostas_itens_fornecedor
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respostas_itens_fornecedor TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respostas_itens_fornecedor TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respostas_itens_fornecedor TO service_role;
