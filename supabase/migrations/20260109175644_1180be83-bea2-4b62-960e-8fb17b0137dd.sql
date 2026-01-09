-- Corrigir política de INSERT para fornecedores em mensagens_contato
DROP POLICY IF EXISTS "Mensagens: fornecedores criam" ON public.mensagens_contato;

CREATE POLICY "Mensagens: fornecedores criam"
ON public.mensagens_contato
FOR INSERT
TO authenticated
WITH CHECK (
  remetente_tipo = 'fornecedor'
  AND remetente_fornecedor_id = get_fornecedor_id_from_user(auth.uid())
  AND remetente_fornecedor_id IS NOT NULL
  AND remetente_interno_id IS NULL
);