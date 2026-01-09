
-- Drop existing problematic policies
DROP POLICY IF EXISTS "Destinatários podem ver suas mensagens" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Remetentes podem ver destinatários de suas mensagens" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Usuários podem atualizar suas mensagens recebidas" ON public.mensagens_contato_destinatarios;
DROP POLICY IF EXISTS "Remetentes podem inserir destinatários" ON public.mensagens_contato_destinatarios;

-- Create security definer function to check if user is sender of a message
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

-- Create security definer function to check if fornecedor is sender of a message
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

-- Create security definer function to check if user is recipient
CREATE OR REPLACE FUNCTION public.is_message_recipient(_destinatario_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _destinatario_id = _user_id
$$;

-- Recreate policies using security definer functions
CREATE POLICY "Destinatários internos podem ver suas mensagens" 
ON public.mensagens_contato_destinatarios 
FOR SELECT 
USING (
  destinatario_interno_id = auth.uid()
);

CREATE POLICY "Destinatários fornecedores podem ver suas mensagens" 
ON public.mensagens_contato_destinatarios 
FOR SELECT 
USING (
  destinatario_tipo = 'fornecedor' AND destinatario_fornecedor_id IS NOT NULL
);

CREATE POLICY "Remetentes internos podem ver destinatários" 
ON public.mensagens_contato_destinatarios 
FOR SELECT 
USING (
  public.is_message_sender(mensagem_id, auth.uid())
);

CREATE POLICY "Usuários podem atualizar mensagens recebidas" 
ON public.mensagens_contato_destinatarios 
FOR UPDATE 
USING (
  destinatario_interno_id = auth.uid()
);

CREATE POLICY "Fornecedores podem atualizar mensagens recebidas" 
ON public.mensagens_contato_destinatarios 
FOR UPDATE 
USING (
  destinatario_tipo = 'fornecedor' AND destinatario_fornecedor_id IS NOT NULL
);

CREATE POLICY "Remetentes internos podem inserir destinatários" 
ON public.mensagens_contato_destinatarios 
FOR INSERT 
WITH CHECK (
  public.is_message_sender(mensagem_id, auth.uid())
);

CREATE POLICY "Remetentes fornecedores podem inserir destinatários" 
ON public.mensagens_contato_destinatarios 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.fornecedores f
    WHERE f.user_id = auth.uid()
    AND public.is_message_sender_fornecedor(mensagem_id, f.id)
  )
);
