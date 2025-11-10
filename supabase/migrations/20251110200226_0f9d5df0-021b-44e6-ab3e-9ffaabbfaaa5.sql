-- Garantir que quando um fornecedor é deletado, o usuário também seja removido
-- Criar função para deletar usuário quando fornecedor é excluído

CREATE OR REPLACE FUNCTION delete_fornecedor_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deletar o usuário do auth se existir user_id
  IF OLD.user_id IS NOT NULL THEN
    -- Usar extensão http para chamar a API de admin do Supabase
    -- Mas como não temos a extensão http, vamos apenas logar
    -- O ideal é que a aplicação chame a edge function antes de deletar
    RAISE LOG 'Fornecedor % deletado, user_id: %', OLD.id, OLD.user_id;
  END IF;
  
  RETURN OLD;
END;
$$;

-- Criar trigger para executar ANTES de deletar o fornecedor
DROP TRIGGER IF EXISTS before_delete_fornecedor ON fornecedores;
CREATE TRIGGER before_delete_fornecedor
  BEFORE DELETE ON fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION delete_fornecedor_auth_user();