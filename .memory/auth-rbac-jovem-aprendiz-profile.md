# Jovem Aprendiz - Perfil de Acesso

## Data: 2026-04-02

## Contexto
Novo perfil "Jovem Aprendiz" criado com as mesmas permissões de visualização do "Controle de Compras" (read-only em tudo), porém com acesso total (leitura e escrita) ao menu "Cadastro de Fornecedores".

## Regras de acesso
- **Read-only** em todos os menus (igual ao Controle de Compras)
- **Acesso total** ao Cadastro de Fornecedores (pode criar, editar, aprovar, etc.)
- Aparece no menu completo da sidebar (não é restrito como Gerente de Contratos ou Contabilidade)
- Não tem acesso ao menu Cadastro de Usuários (não é perfil administrativo)

## Implementação
- Coluna `jovem_aprendiz` (boolean, default false) na tabela `profiles`
- `useCanEdit()` retorna false para Jovem Aprendiz (read-only global)
- Na página Fornecedores.tsx, `canEdit` é sobrescrito para true quando é Jovem Aprendiz
- Integrado em todos os caches e contextos do DashboardLayout

## Arquivos alterados
- src/hooks/useUserContext.ts
- src/components/DashboardLayout.tsx
- src/components/AppSidebar.tsx
- src/components/usuarios/DialogUsuario.tsx
- src/pages/Fornecedores.tsx
- supabase/functions/criar-usuario-admin/index.ts
