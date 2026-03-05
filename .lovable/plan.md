

## Plan: Add Notification Badge to Contabilidade Menu

### Problem
The "Contabilidade" sidebar menu item has no notification badge showing pending items, unlike Compliance and Cadastro de Fornecedores.

### Changes

**1. `src/components/AppSidebar.tsx`**

- Add a new state `contabilidadePendingCount` (similar to existing badge states)
- Add a `useEffect` that queries `encaminhamentos_contabilidade` where `enviado_contabilidade = true` AND (`respondido_contabilidade IS NULL` OR `respondido_contabilidade = false`), counting the total pending items
- Poll every 60 seconds (same pattern as other badges)
- Render the badge on the `/contabilidade` menu item in both collapsed and expanded sidebar states, following the exact same pattern used for Compliance and Fornecedores badges

### Query Logic
```sql
SELECT count(*) FROM encaminhamentos_contabilidade
WHERE enviado_contabilidade = true
AND (respondido_contabilidade IS NULL OR respondido_contabilidade = false)
```

This counts all encaminhamentos sent to contabilidade that haven't been responded to yet -- matching the `totalPendentes` logic already used in the Contabilidade page itself.

### Note on Contrato de Gestão Badges
The Contabilidade page already displays per-contrato pending badges (red destructive badges in the "Processos Pendentes" column). No changes needed there.

