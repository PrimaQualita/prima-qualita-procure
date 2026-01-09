
-- Rebuild RLS for messaging tables to eliminate infinite recursion

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('mensagens_contato', 'mensagens_contato_destinatarios')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

ALTER TABLE public.mensagens_contato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_contato_destinatarios ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.get_fornecedor_id_from_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.fornecedores WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_message_sender(_message_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mensagens_contato
    WHERE id = _message_id
      AND remetente_fornecedor_id = _fornecedor_id
  )
$$;

-- =============================
-- RLS: mensagens_contato
-- =============================

CREATE POLICY "Mensagens: participantes podem ler"
ON public.mensagens_contato
FOR SELECT
TO authenticated
USING (
  remetente_interno_id = auth.uid()
  OR remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.mensagens_contato_destinatarios mcd
    WHERE mcd.mensagem_id = mensagens_contato.id
      AND COALESCE(mcd.excluida, false) = false
      AND (
        mcd.destinatario_interno_id = auth.uid()
        OR mcd.destinatario_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid())
      )
  )
);

CREATE POLICY "Mensagens: internos criam"
ON public.mensagens_contato
FOR INSERT
TO authenticated
WITH CHECK (
  remetente_tipo = 'interno'
  AND remetente_interno_id = auth.uid()
  AND remetente_fornecedor_id IS NULL
);

CREATE POLICY "Mensagens: fornecedores criam"
ON public.mensagens_contato
FOR INSERT
TO authenticated
WITH CHECK (
  remetente_tipo = 'fornecedor'
  AND remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid())
  AND remetente_interno_id IS NULL
);

CREATE POLICY "Mensagens: remetente interno atualiza"
ON public.mensagens_contato
FOR UPDATE
TO authenticated
USING (remetente_interno_id = auth.uid())
WITH CHECK (remetente_interno_id = auth.uid());

CREATE POLICY "Mensagens: remetente fornecedor atualiza"
ON public.mensagens_contato
FOR UPDATE
TO authenticated
USING (remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()))
WITH CHECK (remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()));

-- =============================
-- RLS: mensagens_contato_destinatarios
-- =============================

CREATE POLICY "Destinatarios: participantes podem ler"
ON public.mensagens_contato_destinatarios
FOR SELECT
TO authenticated
USING (
  (destinatario_interno_id = auth.uid() AND COALESCE(excluida, false) = false)
  OR (destinatario_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()) AND COALESCE(excluida, false) = false)
  OR public.is_message_sender(mensagem_id, auth.uid())
  OR public.is_message_sender_fornecedor(mensagem_id, public.get_fornecedor_id_from_user(auth.uid()))
);

CREATE POLICY "Destinatarios: remetentes inserem (com restricao fornecedor)"
ON public.mensagens_contato_destinatarios
FOR INSERT
TO authenticated
WITH CHECK (
  (
    public.is_message_sender(mensagem_id, auth.uid())
    AND (
      (destinatario_tipo = 'interno' AND destinatario_interno_id IS NOT NULL AND destinatario_fornecedor_id IS NULL)
      OR (destinatario_tipo = 'fornecedor' AND destinatario_fornecedor_id IS NOT NULL AND destinatario_interno_id IS NULL)
    )
  )
  OR (
    public.is_message_sender_fornecedor(mensagem_id, public.get_fornecedor_id_from_user(auth.uid()))
    AND destinatario_tipo = 'interno'
    AND destinatario_interno_id IS NOT NULL
    AND destinatario_fornecedor_id IS NULL
  )
);

CREATE POLICY "Destinatarios: destinatario atualiza (lida/excluida)"
ON public.mensagens_contato_destinatarios
FOR UPDATE
TO authenticated
USING (
  destinatario_interno_id = auth.uid()
  OR destinatario_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid())
)
WITH CHECK (
  destinatario_interno_id = auth.uid()
  OR destinatario_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid())
);
