-- Adicionar coluna protocolo na tabela recursos_fornecedor
ALTER TABLE public.recursos_fornecedor 
ADD COLUMN protocolo text;

-- Criar política RLS para verificação pública
CREATE POLICY "Public can verify recursos fornecedor by protocolo"
ON public.recursos_fornecedor
FOR SELECT
USING (protocolo IS NOT NULL);