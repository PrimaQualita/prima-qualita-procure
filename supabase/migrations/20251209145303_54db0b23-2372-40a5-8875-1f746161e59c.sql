
-- Criar política de SELECT para respostas_itens_fornecedor que está FALTANDO
-- Esta política é necessária para que o sistema consiga ler os itens dos fornecedores

CREATE POLICY "Allow public select respostas itens"
ON public.respostas_itens_fornecedor
FOR SELECT
USING (true);
