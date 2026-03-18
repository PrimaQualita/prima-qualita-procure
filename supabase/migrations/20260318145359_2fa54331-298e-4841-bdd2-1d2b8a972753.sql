-- Impede duplicidade de pendência para o mesmo processo + fornecedor vencedor
CREATE UNIQUE INDEX IF NOT EXISTS processos_para_contratar_unique_processo_fornecedor
ON public.processos_para_contratar (processo_compra_id, fornecedor_vencedor_id)
WHERE fornecedor_vencedor_id IS NOT NULL;

-- Impede múltiplos registros genéricos (sem fornecedor) para o mesmo processo
CREATE UNIQUE INDEX IF NOT EXISTS processos_para_contratar_unique_generico
ON public.processos_para_contratar (processo_compra_id)
WHERE fornecedor_vencedor_id IS NULL;