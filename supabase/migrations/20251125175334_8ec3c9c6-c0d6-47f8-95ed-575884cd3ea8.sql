-- Política para permitir que qualquer pessoa veja mensagens de negociação de uma seleção específica
CREATE POLICY "Anyone can view negotiation messages" 
ON public.mensagens_negociacao 
FOR SELECT 
USING (true);

-- Política para permitir que qualquer pessoa envie mensagens como fornecedor
CREATE POLICY "Anyone can send negotiation messages as fornecedor" 
ON public.mensagens_negociacao 
FOR INSERT 
WITH CHECK (tipo_remetente = 'fornecedor');