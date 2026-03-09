

# Problema: Perfis cumulativos não respeitados nas restrições do Responsável Legal

## Diagnóstico

O usuário Diego tem **múltiplos perfis** (incluindo Responsável Legal + outros). A regra do sistema é que perfis são **cumulativos** — o usuário herda a **união** de todas as permissões. Porém, as implementações atuais restringem o usuário apenas por ter a flag `responsavel_legal = true`, sem verificar se ele também tem outros perfis com mais permissões.

### Problemas encontrados:

1. **`DetalheSelecao.tsx`** (linha 109): `canEditSelecao = !isResponsavelLegal` — bloqueia edição se é RL, **ignorando completamente** outros perfis. Também só busca `responsavel_legal` do profiles, sem checar `user_roles` (gestor/colaborador).

2. **`RespostasCotacao.tsx`** (linha 1008-1010): Verifica `hasEditRole` com `gestor, compliance, superintendente_executivo` do profiles, mas **não inclui `colaborador`** (que vem da tabela `user_roles`, não do `profiles`).

3. **`PropostasSelecao.tsx`** (linha 93-95): Mesmo problema — verifica apenas profiles, sem consultar `user_roles` para o papel de colaborador/gestor.

## Plano de correção

### 1. `DetalheSelecao.tsx`
- Expandir a query do profile para incluir `gestor, compliance, superintendente_executivo`
- Consultar `user_roles` para verificar se tem papel `gestor` ou `colaborador`
- Mudar `canEditSelecao` para: só restringir se é RL **puro** (sem outros perfis com permissão de edição)

### 2. `RespostasCotacao.tsx`
- Adicionar consulta a `user_roles` para verificar papel `colaborador` ou `gestor`
- Incluir esse resultado no cálculo de `hasEditRole`

### 3. `PropostasSelecao.tsx`
- Mesma correção: consultar `user_roles` e incluir no `hasEditRole`

### Lógica unificada para os 3 arquivos:
```typescript
// Buscar profile flags
const isRL = profile.responsavel_legal || false;
const hasProfileEditRole = profile.gestor || profile.compliance || profile.superintendente_executivo;

// Buscar user_roles
const { data: userRoles } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", user.id)
  .in("role", ["gestor", "colaborador"]);

const hasUserRole = userRoles && userRoles.length > 0;

// Só restringe se é APENAS RL
const canEdit = isRL ? !!(hasProfileEditRole || hasUserRole) : true;
```

Isso garante que se Diego é RL + Gestor (ou qualquer outro perfil), ele terá acesso completo.

