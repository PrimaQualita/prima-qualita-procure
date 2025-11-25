-- Política para permitir que fornecedores públicos (via código de acesso) enviem mensagens
CREATE POLICY "Public can create mensagens for selecao"
ON public.mensagens_selecao
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.selecao_propostas_fornecedor spf
    WHERE spf.selecao_id = mensagens_selecao.selecao_id
    AND spf.fornecedor_id = mensagens_selecao.fornecedor_id
    AND spf.codigo_acesso IS NOT NULL
  )
);

-- Política para permitir visualização pública das mensagens de uma seleção
CREATE POLICY "Public can view mensagens"
ON public.mensagens_selecao
FOR SELECT
USING (true);

-- Política para usuários autenticados (internos) enviarem mensagens
CREATE POLICY "Authenticated users can create mensagens"
ON public.mensagens_selecao
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND mensagens_selecao.usuario_id = auth.uid()
  AND mensagens_selecao.tipo_usuario = 'interno'
);