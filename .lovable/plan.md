

## Problema Identificado

No modo **Comparativo** do BI Controle, o componente `ComparativoKPICard` exibe cada KPI individualmente como `[KPI, Restante]` — por isso aparece "Requisição - Solicitadas vs Restante", "Requisição - Geradas vs Restante", etc. Esse "Restante" é o total do módulo menos o valor do KPI, o que não faz sentido para o módulo **Processo**.

## Solução

Para o módulo **Processo** (`documentos_processo`), o modo comparativo deve funcionar de forma diferente dos demais módulos:

1. **Agrupamento por categoria**: Os 18 KPIs são agrupados em 6 categorias (Requisição, Aut. Despesa, Aut. Seleção, Aut. Compra Direta, Homologação, Atas), cada uma com 3 métricas (Solicitadas/Geradas/Pendentes).

2. **Seleção múltipla de grupos**: O usuário pode marcar mais de um grupo (ex: Requisição + Aut. Despesa) para comparar lado a lado.

3. **Um gráfico por grupo selecionado**: Cada grupo selecionado gera um card com um único gráfico mostrando as 3 barras (Solicitadas, Geradas, Pendentes) — sem "Restante".

4. **Demais módulos inalterados**: Contratos, Compliance, Seleções, etc. continuam com o comportamento atual.

## Alterações Técnicas

### `src/components/dashboard/DashboardBIOperacional.tsx`

- Definir constante com os 6 grupos do módulo Processo:
  ```
  GRUPOS_PROCESSO = [
    { key: "requisicao", title: "Requisição", indices: [0,1,2] },
    { key: "aut_despesa", title: "Aut. Despesa", indices: [3,4,5] },
    ...
  ]
  ```

- Adicionar estado `gruposProcessoSelecionados: string[]` (default: `["requisicao"]`).

- No bloco comparativo (linha ~700), quando `selectedKey === 'documentos_processo'`:
  - Renderizar checkboxes para selecionar os grupos (Requisição, Aut. Despesa, etc.)
  - Para cada grupo selecionado, renderizar um card com gráfico de 3 barras (Solicitadas/Geradas/Pendentes)
  - Cada card tem seu próprio seletor de tipo de gráfico (barras/pizza/vela/pareto)

- Quando `selectedKey !== 'documentos_processo'`: manter o comportamento atual com `ComparativoKPICard` e "Restante".

