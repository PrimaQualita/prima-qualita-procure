-- Add lote_id to supplier item responses to disambiguate items in criterio por_lote
ALTER TABLE public.selecao_respostas_itens_fornecedor
ADD COLUMN IF NOT EXISTS lote_id uuid;

-- Backfill lote_id only when there is exactly one possible lot match
WITH matches AS (
  SELECT
    sri.id AS resposta_id,
    (array_agg(DISTINCT ic.lote_id))[1] AS lote_id,
    COUNT(DISTINCT ic.lote_id) AS cnt_lotes
  FROM public.selecao_respostas_itens_fornecedor sri
  JOIN public.selecao_propostas_fornecedor sp
    ON sp.id = sri.proposta_id
  JOIN public.selecoes_fornecedores sf
    ON sf.id = sp.selecao_id
  JOIN public.itens_cotacao ic
    ON ic.cotacao_id = sf.cotacao_relacionada_id
   AND ic.numero_item = sri.numero_item
   AND ic.descricao = sri.descricao
  WHERE sri.lote_id IS NULL
    AND ic.lote_id IS NOT NULL
  GROUP BY sri.id
)
UPDATE public.selecao_respostas_itens_fornecedor sri
SET lote_id = m.lote_id
FROM matches m
WHERE sri.id = m.resposta_id
  AND m.cnt_lotes = 1;

-- Index for fast composite lookup (lote_id + numero_item)
CREATE INDEX IF NOT EXISTS idx_srif_lote_numero_item
ON public.selecao_respostas_itens_fornecedor (lote_id, numero_item);
