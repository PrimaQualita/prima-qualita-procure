
-- Garantir que RLS não está bloqueando completamente
ALTER TABLE public.respostas_itens_fornecedor FORCE ROW LEVEL SECURITY;

-- GRANT ALL para garantir acesso
GRANT ALL PRIVILEGES ON TABLE public.respostas_itens_fornecedor TO anon;
GRANT ALL PRIVILEGES ON TABLE public.respostas_itens_fornecedor TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.respostas_itens_fornecedor TO service_role;

-- Também garantir usage no schema
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
