-- Garantir que a coluna compliance existe na tabela profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'compliance'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN compliance boolean DEFAULT false;
  END IF;
END $$;

-- Garantir que as colunas de compliance existem na tabela cotacoes_precos
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cotacoes_precos' 
    AND column_name = 'enviado_compliance'
  ) THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN enviado_compliance boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cotacoes_precos' 
    AND column_name = 'data_envio_compliance'
  ) THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN data_envio_compliance timestamp with time zone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cotacoes_precos' 
    AND column_name = 'respondido_compliance'
  ) THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN respondido_compliance boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cotacoes_precos' 
    AND column_name = 'data_resposta_compliance'
  ) THEN
    ALTER TABLE public.cotacoes_precos ADD COLUMN data_resposta_compliance timestamp with time zone;
  END IF;
END $$;

-- Garantir que a tabela encaminhamentos_processo existe com todas as colunas
CREATE TABLE IF NOT EXISTS public.encaminhamentos_processo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid REFERENCES public.cotacoes_precos(id),
  processo_numero text NOT NULL,
  protocolo text NOT NULL,
  storage_path text NOT NULL,
  url text NOT NULL,
  gerado_por uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Garantir que a tabela planilhas_consolidadas existe
CREATE TABLE IF NOT EXISTS public.planilhas_consolidadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES public.cotacoes_precos(id),
  usuario_gerador_id uuid NOT NULL REFERENCES auth.users(id),
  nome_arquivo text NOT NULL,
  url_arquivo text NOT NULL,
  protocolo text,
  data_geracao timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Garantir RLS está habilitado
ALTER TABLE public.encaminhamentos_processo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planilhas_consolidadas ENABLE ROW LEVEL SECURITY;