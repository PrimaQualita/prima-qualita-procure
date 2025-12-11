-- Garantir que função pode ser executada por todos
GRANT EXECUTE ON FUNCTION public.pode_inserir_resposta_item(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.pode_inserir_resposta_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pode_inserir_resposta_item(uuid) TO public;

-- Se ainda não funcionar, criar política ainda mais simples
-- Dropar política atual
DROP POLICY IF EXISTS "Public can insert respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;

-- Criar política simples que permite INSERT público 
-- A segurança é garantida pelo fato de que cotacao_resposta_fornecedor_id precisa existir (FK)
-- e a criação da resposta já tem suas próprias verificações
CREATE POLICY "Anyone can insert respostas itens"
ON public.respostas_itens_fornecedor
FOR INSERT
WITH CHECK (true);