
-- Permitir que fornecedores com código de acesso (anônimos) visualizem mensagens da seleção
CREATE POLICY "Public can view mensagens for selecao with codigo_acesso"
ON public.mensagens_selecao
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM selecao_propostas_fornecedor spf
    WHERE spf.selecao_id = mensagens_selecao.selecao_id
    AND spf.codigo_acesso IS NOT NULL
  )
);
