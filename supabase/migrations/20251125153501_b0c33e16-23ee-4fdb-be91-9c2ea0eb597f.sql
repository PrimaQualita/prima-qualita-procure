-- Habilitar realtime para a tabela itens_abertos_lances
ALTER TABLE public.itens_abertos_lances REPLICA IDENTITY FULL;

-- Adicionar tabela à publicação de realtime (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'itens_abertos_lances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.itens_abertos_lances;
  END IF;
END $$;