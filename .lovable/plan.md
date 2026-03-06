

## Plano: Filtrar fornecedores fictícios no BI + Limpeza automática nas edge functions + Limpar órfãos existentes

### 1. Filtrar no BI Operacional
**Arquivo:** `src/components/dashboard/DashboardBIOperacional.tsx` (linhas ~368-370)

Antes de calcular KPIs de fornecedores, filtrar os registros com email contendo `precos.publicos`:

```typescript
const fornecedoresReais = fornecedores.filter(f => !f.email?.includes('precos.publicos'));
const fornAprovados = fornecedoresReais.filter(f => f.status_aprovacao === "aprovado");
const fornEmAberto = fornecedoresReais.filter(f => f.status_aprovacao !== "aprovado" && f.status_aprovacao !== "rejeitado");
```

Também aplicar `fornecedoresReais` nos cálculos de `fornAVencer`, `fornVencidos` e `fornEmDia`.

### 2. Limpar fornecedores fictícios órfãos ao deletar processo
**Arquivo:** `supabase/functions/deletar-processo/index.ts`

Após a deleção dos registros do banco (linha ~723), adicionar lógica para:
- Coletar `fornecedor_id` das respostas de cotação do processo sendo deletado
- Filtrar apenas os que têm email `precos.publicos`
- Verificar se esses fornecedores ainda têm respostas em **outras** cotações
- Se não tiverem, deletar o registro do fornecedor

### 3. Limpar fornecedores fictícios órfãos ao deletar seleção
**Arquivo:** `supabase/functions/deletar-selecao/index.ts`

Mesma lógica aplicada antes de deletar a seleção — coletar fornecedores fictícios vinculados e deletar os órfãos.

### 4. Limpar os 57 registros órfãos existentes
Usar ferramenta de dados para executar:
```sql
DELETE FROM fornecedores 
WHERE email LIKE '%precos.publicos%' 
AND id NOT IN (
  SELECT DISTINCT fornecedor_id FROM cotacao_respostas_fornecedor WHERE fornecedor_id IS NOT NULL
);
```

### Segurança
- Fornecedores reais **nunca** serão afetados — o filtro `email LIKE '%precos.publicos%'` é exclusivo dos registros fictícios criados pelo sistema.
- A verificação de órfão garante que fornecedores fictícios ainda em uso não sejam deletados.

