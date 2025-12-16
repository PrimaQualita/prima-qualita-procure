-- Adicionar política para usuários internos visualizarem respostas_itens_fornecedor de qualquer cotação
CREATE POLICY "Internal users can view all respostas itens"
ON public.respostas_itens_fornecedor
FOR SELECT
USING (is_internal_user(auth.uid()));