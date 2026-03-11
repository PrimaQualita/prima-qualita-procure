

## Plano: Remover Gestor da permissão de excluir Contrato de Gestão

### Alteração

**Arquivo:** `src/pages/ProcessosCompras.tsx`, linha 648

Trocar:
```typescript
{isUsuarioInterno && (isGestor || isCompliance || isSuperintendenteExecutivo) && (
```

Por:
```typescript
{isUsuarioInterno && (isCompliance || isSuperintendenteExecutivo) && (
```

O perfil Gestor só poderá excluir contratos de gestão se também tiver o perfil Compliance ou Superintendente Executivo (pois os perfis são cumulativos e essas flags seriam `true` independentemente).

### Impacto
- Apenas a visibilidade do botão de exclusão é afetada
- Nenhuma outra funcionalidade é alterada
- 1 linha modificada em 1 arquivo

