// Stub permissivo: até a matriz de permissões granular ser implementada,
// libera todas as permissões para usuários internos. Os componentes já
// fazem checagens adicionais por perfil (RL, Compliance, Gestor, etc.).
export function useHasPermission(_permission: string): boolean {
  return true;
}
