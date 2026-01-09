-- Atualizar a política de UPDATE para mensagens_contato_destinatarios
-- para garantir que fornecedores possam atualizar suas próprias linhas

-- Primeiro, remover a política existente
DROP POLICY IF EXISTS "Destinatarios: destinatario atualiza (lida/excluida)" ON public.mensagens_contato_destinatarios;

-- Criar nova política de UPDATE mais robusta
CREATE POLICY "Destinatarios: destinatario atualiza (lida/excluida)" 
ON public.mensagens_contato_destinatarios 
FOR UPDATE 
TO authenticated
USING (
  destinatario_interno_id = auth.uid() 
  OR 
  destinatario_fornecedor_id IN (SELECT id FROM public.fornecedores WHERE user_id = auth.uid())
)
WITH CHECK (
  destinatario_interno_id = auth.uid() 
  OR 
  destinatario_fornecedor_id IN (SELECT id FROM public.fornecedores WHERE user_id = auth.uid())
);