-- Adicionar política UPDATE para permitir salvar URL do PDF da proposta
CREATE POLICY "Public can update proposta url_pdf"
ON public.selecao_propostas_fornecedor
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Garantir GRANT UPDATE para public/anon
GRANT UPDATE ON public.selecao_propostas_fornecedor TO anon;
GRANT UPDATE ON public.selecao_propostas_fornecedor TO authenticated;