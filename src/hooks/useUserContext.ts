import { useOutletContext } from "react-router-dom";

export interface UserContextType {
  isGestor: boolean;
  isCompliance: boolean;
  isResponsavelLegal: boolean;
  isColaborador: boolean;
  isSuperintendenteExecutivo: boolean;
  isGerenteContratos: boolean;
  profile: any;
  userId?: string;
}

export function useUserContext() {
  return useOutletContext<UserContextType>();
}

// Helper para verificar se o usuário pode editar/excluir (não é apenas Responsável Legal)
export function useCanEdit() {
  const context = useOutletContext<UserContextType>();
  
  // Se não tem contexto, assume que pode editar (fallback)
  if (!context) return true;
  
  const { isResponsavelLegal, isGestor, isCompliance, isColaborador, isSuperintendenteExecutivo } = context;
  
  // Se tem algum outro papel além de Responsável Legal, pode editar
  if (isGestor || isCompliance || isColaborador || isSuperintendenteExecutivo) {
    return true;
  }
  
  // Se é APENAS Responsável Legal, não pode editar
  if (isResponsavelLegal) {
    return false;
  }
  
  // Default: pode editar
  return true;
}
