-- Política para permitir leitura pública do termo de referência
-- Isso é necessário para que fornecedores não autenticados possam 
-- visualizar o termo de referência na página de resposta de cotação

CREATE POLICY "Termo de referencia publico para cotacao"
ON public.anexos_processo_compra
FOR SELECT
USING (tipo_anexo = 'termo_referencia');