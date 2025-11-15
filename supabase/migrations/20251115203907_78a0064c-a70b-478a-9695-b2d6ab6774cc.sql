-- LIMPAR TODAS AS POLÍTICAS DE respostas_itens_fornecedor
DROP POLICY IF EXISTS "Anyone can create respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Internal users can delete respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Internal users can view respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Public can delete respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Public can insert respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Public can update respostas itens" ON public.respostas_itens_fornecedor;

-- CRIAR POLÍTICAS LIMPAS E SIMPLES
-- Permitir SELECT para todos (necessário para buscar depois)
CREATE POLICY "Allow public select respostas itens"
ON public.respostas_itens_fornecedor
FOR SELECT
TO public
USING (true);

-- Permitir INSERT para todos
CREATE POLICY "Allow public insert respostas itens"
ON public.respostas_itens_fornecedor
FOR INSERT
TO public
WITH CHECK (true);

-- Permitir UPDATE para todos
CREATE POLICY "Allow public update respostas itens"
ON public.respostas_itens_fornecedor
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Permitir DELETE para todos
CREATE POLICY "Allow public delete respostas itens"
ON public.respostas_itens_fornecedor
FOR DELETE
TO public
USING (true);