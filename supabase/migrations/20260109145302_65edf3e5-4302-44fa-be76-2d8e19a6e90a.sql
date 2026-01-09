
-- Fix infinite recursion by ensuring SECURITY DEFINER helpers bypass RLS (row_security = off)

CREATE OR REPLACE FUNCTION public.get_fornecedor_id_from_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT id FROM public.fornecedores WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_message_sender(_message_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mensagens_contato
    WHERE id = _message_id
      AND remetente_interno_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_message_sender_fornecedor(_message_id uuid, _fornecedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mensagens_contato
    WHERE id = _message_id
      AND remetente_fornecedor_id = _fornecedor_id
  )
$$;
