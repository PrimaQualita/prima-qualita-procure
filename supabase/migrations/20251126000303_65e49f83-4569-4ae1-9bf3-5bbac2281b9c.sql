-- Habilitar realtime para tabela selecoes_fornecedores
ALTER TABLE selecoes_fornecedores REPLICA IDENTITY FULL;

-- Adicionar tabela ao publication de realtime (se ainda não estiver)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'selecoes_fornecedores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.selecoes_fornecedores;
  END IF;
END $$;