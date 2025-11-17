-- Habilitar Realtime para a tabela fornecedores
ALTER TABLE public.fornecedores REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fornecedores;

-- Habilitar Realtime para a tabela documentos_fornecedor
ALTER TABLE public.documentos_fornecedor REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos_fornecedor;