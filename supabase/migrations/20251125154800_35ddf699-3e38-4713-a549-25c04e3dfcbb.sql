-- Habilitar REPLICA IDENTITY FULL para lances_fornecedores (necessário para realtime)
ALTER TABLE public.lances_fornecedores REPLICA IDENTITY FULL;

-- Adicionar tabela à publicação de realtime (se ainda não estiver)
ALTER PUBLICATION supabase_realtime ADD TABLE public.lances_fornecedores;