
-- 1) Remover duplicatas da proposta afetada, mantendo apenas o registro mais antigo
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY proposta_id, numero_item, COALESCE(lote_id::text, '')
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.selecao_respostas_itens_fornecedor
  WHERE proposta_id = 'c19dc196-ebaa-418e-b27c-85632e501f07'
)
DELETE FROM public.selecao_respostas_itens_fornecedor
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Recalcular valor_total_proposta com base nos itens remanescentes
UPDATE public.selecao_propostas_fornecedor spf
SET valor_total_proposta = COALESCE((
  SELECT SUM(valor_total_item)
  FROM public.selecao_respostas_itens_fornecedor
  WHERE proposta_id = spf.id
), 0)
WHERE spf.id = 'c19dc196-ebaa-418e-b27c-85632e501f07';

-- 3) Limpar URL do PDF antigo para forçar regeneração com valor correto
UPDATE public.selecao_propostas_fornecedor
SET url_pdf_proposta = NULL
WHERE id = 'c19dc196-ebaa-418e-b27c-85632e501f07';
