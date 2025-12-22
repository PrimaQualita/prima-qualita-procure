-- Permitir que qualquer usuário interno (com registro em public.profiles) consiga
-- visualizar documentos adicionais da finalização, independentemente do papel.
-- Isso evita que a mesclagem do PDF varie conforme o perfil (ex: Responsável Legal).

BEGIN;

-- Recriar policy de SELECT para usuários internos
DROP POLICY IF EXISTS internal_users_can_select_all_docs
  ON public.documentos_finalizacao_fornecedor;

CREATE POLICY internal_users_can_select_all_docs
  ON public.documentos_finalizacao_fornecedor
  FOR SELECT
  TO authenticated
  USING (public.is_internal_user(auth.uid()));

COMMIT;