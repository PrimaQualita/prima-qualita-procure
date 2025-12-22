import { useOutletContext } from "react-router-dom";

export interface UserContextType {
  isGestor: boolean;
  isCompliance: boolean;
  isResponsavelLegal: boolean;
  isColaborador: boolean;
  isSuperintendenteExecutivo: boolean;
  isGerenteContratos: boolean;
  isContabilidade: boolean;
  profile: any;
  userId?: string;
}

export function useUserContext() {
  return useOutletContext<UserContextType>();
}

// Helper para verificar se o usuário pode editar/excluir (não é apenas Responsável Legal, Gerente de Contratos ou Contabilidade)
export function useCanEdit() {
  const context = useOutletContext<UserContextType>();
  
  // Se não tem contexto, assume que pode editar (fallback)
  if (!context) return true;
  
  const { isResponsavelLegal, isGestor, isCompliance, isColaborador, isSuperintendenteExecutivo, isGerenteContratos, isContabilidade } = context;
  
  // Gestor, Compliance, Colaborador e Superintendente Executivo podem editar tudo
  if (isGestor || isCompliance || isColaborador || isSuperintendenteExecutivo) {
    return true;
  }
  
  // Responsável Legal, Gerente de Contratos e Contabilidade não podem editar (apenas visualizar)
  if (isResponsavelLegal || isGerenteContratos || isContabilidade) {
    return false;
  }
  
  // Default: pode editar
  return true;
}

// Helper para verificar se é APENAS usuário Contabilidade (para permissões específicas)
export function useIsOnlyContabilidade() {
  const context = useOutletContext<UserContextType>();
  
  if (!context) return false;
  
  const { isGestor, isCompliance, isColaborador, isSuperintendenteExecutivo, isGerenteContratos, isResponsavelLegal, isContabilidade } = context;
  
  // Verifica se tem outros papéis além de contabilidade
  const temOutrosPapeis = isGestor || isCompliance || isColaborador || isSuperintendenteExecutivo || isGerenteContratos || isResponsavelLegal;
  
  return isContabilidade && !temOutrosPapeis;
}
