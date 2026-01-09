
-- Drop ALL existing policies on both tables to start fresh
DROP POLICY IF EXISTS "Remetentes podem ver suas mensagens" ON public.mensagens_contato;
DROP POLICY IF EXISTS "Remetentes podem inserir mensagens" ON public.mensagens_contato;
DROP POLICY IF EXISTS "Remetentes podem atualizar suas mensagens" ON public.mensagens_contato;
DROP POLICY IF EXISTS "Destinatários internos podem ver suas mensagens" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Destinatários fornecedores podem ver suas mensagens" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Remetentes internos podem ver destinatários" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Usuários podem atualizar mensagens recebidas" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Fornecedores podem atualizar mensagens recebidas" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Remetentes internos podem inserir destinatários" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Remetentes fornecedores podem inserir destinatários" ON public.mensagens_contato_destinatarios;

-- Create security definer function to get fornecedor_id from user
CREATE OR REPLACE FUNCTION public.get_fornecedor_id_from_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.fornecedores WHERE user_id = _user_id LIMIT 1
$$;

-- POLICIES FOR mensagens_contato (messages table)
-- Simple policies that don't reference mensagens_contato_destinatarios

CREATE POLICY "Usuarios internos podem ver mensagens que enviaram"
ON public.mensagens_contato
FOR SELECT
USING (remetente_interno_id = auth.uid());

CREATE POLICY "Fornecedores podem ver mensagens que enviaram"
ON public.mensagens_contato
FOR SELECT
USING (remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()));

CREATE POLICY "Usuarios internos podem inserir mensagens"
ON public.mensagens_contato
FOR INSERT
WITH CHECK (remetente_interno_id = auth.uid() AND remetente_tipo = 'interno');

CREATE POLICY "Fornecedores podem inserir mensagens"
ON public.mensagens_contato
FOR INSERT
WITH CHECK (
  remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()) 
  AND remetente_tipo = 'fornecedor'
);

CREATE POLICY "Usuarios internos podem atualizar suas mensagens"
ON public.mensagens_contato
FOR UPDATE
USING (remetente_interno_id = auth.uid());

CREATE POLICY "Fornecedores podem atualizar suas mensagens"
ON public.mensagens_contato
FOR UPDATE
USING (remetente_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()));

-- POLICIES FOR mensagens_contato_destinatarios (recipients table)
-- Simple policies that don't create recursion

CREATE POLICY "Destinatarios internos podem ver suas entradas"
ON public.mensagens_contato_destinatarios
FOR SELECT
USING (destinatario_interno_id = auth.uid());

CREATE POLICY "Destinatarios fornecedores podem ver suas entradas"
ON public.mensagens_contato_destinatarios
FOR SELECT
USING (destinatario_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()));

CREATE POLICY "Remetentes internos podem ver destinatarios"
ON public.mensagens_contato_destinatarios
FOR SELECT
USING (public.is_message_sender(mensagem_id, auth.uid()));

CREATE POLICY "Remetentes fornecedores podem ver destinatarios"
ON public.mensagens_contato_destinatarios
FOR SELECT
USING (public.is_message_sender_fornecedor(mensagem_id, public.get_fornecedor_id_from_user(auth.uid())));

CREATE POLICY "Destinatarios internos podem atualizar"
ON public.mensagens_contato_destinatarios
FOR UPDATE
USING (destinatario_interno_id = auth.uid());

CREATE POLICY "Destinatarios fornecedores podem atualizar"
ON public.mensagens_contato_destinatarios
FOR UPDATE
USING (destinatario_fornecedor_id = public.get_fornecedor_id_from_user(auth.uid()));

CREATE POLICY "Usuarios autenticados podem inserir destinatarios"
ON public.mensagens_contato_destinatarios
FOR INSERT
WITH CHECK (true);
