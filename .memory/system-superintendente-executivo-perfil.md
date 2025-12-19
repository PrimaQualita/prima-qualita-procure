# Superintendente Executivo - Perfil e Autorização de Despesa

## Data: 2025-12-19

## Contexto
O campo `gerente_financeiro` foi substituído por `superintendente_executivo` no sistema.

## Mudanças realizadas

### Banco de dados
- Adicionada coluna `superintendente_executivo` na tabela `profiles`
- O sistema mantém compatibilidade lendo também `gerente_financeiro` para usuários antigos

### Cadastro de Usuários (DialogUsuario.tsx)
- Checkbox renomeado de "Gerente Financeiro" para "Superintendente Executivo"
- Salva no campo `superintendente_executivo`
- Lê de `superintendente_executivo` OU `gerente_financeiro` (legado)

### Permissões de Autorização de Despesa
- Apenas Superintendente Executivo pode GERAR autorização de despesa
- Autorização NÃO pode ser anexada manualmente - apenas gerada pelo sistema
- A autorização aparece na lista de anexos APÓS o Termo de Referência

### PDF da Autorização de Despesa
- Usa mesmo logo, rodapé e marca d'água da Requisição
- Inclui certificação simplificada igual à Requisição
- Protocolo salvo na tabela `protocolos_documentos_processo`

### Perfis são cumulativos
- Usuário pode ter múltiplos perfis marcados simultaneamente:
  - Colaborador/Gestor (radio button)
  - Responsável Legal (checkbox)
  - Compliance (checkbox)
  - Gerente de Contratos (checkbox + seleção de contratos)
  - Superintendente Executivo (checkbox)

## Arquivos alterados
- src/components/usuarios/DialogUsuario.tsx
- src/components/processos/DialogAnexosProcesso.tsx
- src/components/DashboardLayout.tsx
- src/components/AppSidebar.tsx
- src/lib/gerarAutorizacaoDespesaPDF.ts
- supabase/functions/criar-usuario-admin/index.ts

## Regra importante
NUNCA INTERROMPER TRABALHOS - sempre executar por completo sem alterar funcionalidades e lógicas existentes.
