-- Adicionar coluna compliance em profiles se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'profiles' 
                 AND column_name = 'compliance') THEN
    ALTER TABLE public.profiles ADD COLUMN compliance BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Adicionar colunas relacionadas ao compliance em cotacoes_precos se não existirem
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'cotacoes_precos' 
                 AND column_name = 'enviado_compliance') THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN enviado_compliance BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'cotacoes_precos' 
                 AND column_name = 'data_envio_compliance') THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN data_envio_compliance TIMESTAMP WITH TIME ZONE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'cotacoes_precos' 
                 AND column_name = 'respondido_compliance') THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN respondido_compliance BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'cotacoes_precos' 
                 AND column_name = 'data_resposta_compliance') THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN data_resposta_compliance TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;