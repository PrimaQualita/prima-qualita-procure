UPDATE public.selecoes_fornecedores s
SET titulo_selecao = 'Seleção de Fornecedores ' || s.numero_selecao || ' - Processo ' || p.numero_processo_interno
FROM public.processos_compras p
WHERE p.id = s.processo_compra_id
  AND s.numero_selecao IS NOT NULL
  AND s.titulo_selecao !~ ('Seleção de Fornecedores ' || s.numero_selecao);