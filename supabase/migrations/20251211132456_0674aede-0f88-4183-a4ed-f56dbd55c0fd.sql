-- Dropar política antiga
DROP POLICY IF EXISTS "Anyone can insert respostas itens" ON public.respostas_itens_fornecedor;

-- Criar política correta para roles anon e authenticated
CREATE POLICY "Anyone can insert respostas itens"
ON public.respostas_itens_fornecedor
FOR INSERT
TO anon, authenticated
WITH CHECK (true);