-- Add conversation/thread support to contatos messages
ALTER TABLE public.mensagens_contato
ADD COLUMN IF NOT EXISTS conversa_id uuid;

-- Backfill existing rows: each existing message becomes its own conversation
UPDATE public.mensagens_contato
SET conversa_id = id
WHERE conversa_id IS NULL;

-- Fast lookup for chat screens
CREATE INDEX IF NOT EXISTS idx_mensagens_contato_conversa_id_created_at
ON public.mensagens_contato (conversa_id, created_at);

-- Ensure new messages default conversa_id to their own id when not provided
CREATE OR REPLACE FUNCTION public.set_conversa_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conversa_id IS NULL THEN
    NEW.conversa_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_conversa_id_default ON public.mensagens_contato;
CREATE TRIGGER trg_set_conversa_id_default
BEFORE INSERT ON public.mensagens_contato
FOR EACH ROW
EXECUTE FUNCTION public.set_conversa_id_default();