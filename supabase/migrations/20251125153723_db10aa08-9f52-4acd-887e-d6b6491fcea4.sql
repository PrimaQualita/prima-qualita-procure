-- Adicionar política pública para fornecedores visualizarem itens abertos via código de acesso
CREATE POLICY "Public can view itens abertos for selecao"
ON public.itens_abertos_lances
FOR SELECT
USING (true);

-- Garantir que a tabela tem realtime ativado
ALTER TABLE public.itens_abertos_lances REPLICA IDENTITY FULL;