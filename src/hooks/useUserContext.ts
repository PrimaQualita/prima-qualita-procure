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

// Helper para verificar se o usuário pode editar/excluir (não é apenas Responsável Legal ou Gerente de Contratos)
export function useCanEdit() {
  const context = useOutletContext<UserContextType>();
  
  // Se não tem contexto, assume que pode editar (fallback)
  if (!context) return true;
  
  const { isResponsavelLegal, isGestor, isCompliance, isColaborador, isSuperintendenteExecutivo, isGerenteContratos } = context;
  
  // Gestor, Compliance, Colaborador e Superintendente Executivo podem editar tudo
  if (isGestor || isCompliance || isColaborador || isSuperintendenteExecutivo) {
    return true;
  }
  
  // Responsável Legal e Gerente de Contratos não podem editar (apenas visualizar)
  if (isResponsavelLegal || isGerenteContratos) {
    return false;
  }
  
  // Default: pode editar
  return true;
}
