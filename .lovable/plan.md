
# Corrigir cores duplicadas no gráfico Pizza

## Problema
O array `BI_COLORS` possui apenas 10 cores, mas o gráfico pizza mensal tem 12 fatias (Jan-Dez). Como as cores são atribuídas por índice com `i % 10`, os meses 11 (Nov) e 12 (Dez) recebem as mesmas cores dos meses 1 (Jan) e 2 (Fev).

## Solução
Adicionar 2 cores extras ao array `BI_COLORS` para totalizar 12 cores distintas, garantindo que cada mês tenha sua cor única.

## Detalhes Técnicos

**Arquivo:** `src/components/dashboard/DashboardBIChart.tsx`

- Adicionar 2 novas cores ao final do array `BI_COLORS`:
  - `#14b8a6` (teal) - posição 11
  - `#a855f7` (violet) - posição 12
- Isso garante que todos os 12 meses tenham cores distintas sem alterar as cores já existentes dos outros meses/gráficos.
