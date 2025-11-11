-- Permitir acesso público aos tipos de processos de compras para cotações abertas
CREATE POLICY "Public can view tipo for open cotacoes"
ON public.processos_compras
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.cotacoes_precos cp
    WHERE cp.processo_compra_id = processos_compras.id
      AND cp.status_cotacao = 'em_aberto'
      AND cp.data_limite_resposta > now()
  )
);