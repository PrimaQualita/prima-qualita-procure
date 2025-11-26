-- Permitir que fornecedores que possuem assinatura possam atualizar a url_arquivo da ata
CREATE POLICY "Fornecedores can update ata url after signing"
ON public.atas_selecao
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM atas_assinaturas_fornecedor aaf
    JOIN fornecedores f ON f.id = aaf.fornecedor_id
    WHERE aaf.ata_id = atas_selecao.id
    AND f.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM atas_assinaturas_fornecedor aaf
    JOIN fornecedores f ON f.id = aaf.fornecedor_id
    WHERE aaf.ata_id = atas_selecao.id
    AND f.user_id = auth.uid()
  )
);