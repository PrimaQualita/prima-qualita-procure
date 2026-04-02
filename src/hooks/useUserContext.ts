import { useOutletContext } from "react-router-dom";

export interface UserContextType {
  isGestor: boolean;
  isCompliance: boolean;
  isResponsavelLegal: boolean;
  isColaborador: boolean;
  isSuperintendenteExecutivo: boolean;
  isGerenteContratos: boolean;
  isContabilidade: boolean;
  isContrato: boolean;
  isControleCompras: boolean;
  isJovemAprendiz: boolean;
  profile: any;
  userId?: string;
  contratosVinculados?: string[];
}

export function useUserContext() {
  return useOutletContext<UserContextType>();
}

// Helper para verificar se o usuário pode editar/excluir (não é apenas Responsável Legal, Gerente de Contratos ou Contabilidade)
export function useCanEdit() {
  const context = useOutletContext<UserContextType>();
  
  // Se não tem contexto, assume que pode editar (fallback)
  if (!context) return true;
  
  const { isResponsavelLegal, isGestor, isCompliance, isColaborador, isSuperintendenteExecutivo, isGerenteContratos, isContabilidade, isControleCompras, isJovemAprendiz } = context;
  
  // Gestor, Compliance, Colaborador e Superintendente Executivo podem editar tudo
  if (isGestor || isCompliance || isColaborador || isSuperintendenteExecutivo) {
    return true;
  }
  
  // Responsável Legal, Gerente de Contratos, Contabilidade, Controle de Compras e Jovem Aprendiz não podem editar (apenas visualizar)
  if (isResponsavelLegal || isGerenteContratos || isContabilidade || isControleCompras || isJovemAprendiz) {
    return false;
  }
  
  // Default: pode editar
  return true;
}

// Helper para verificar se é APENAS usuário Contabilidade (para permissões específicas)
export function useIsOnlyContabilidade() {
  const context = useOutletContext<UserContextType>();
  
  if (!context) return false;
  
  const { isGestor, isCompliance, isColaborador, isSuperintendenteExecutivo, isGerenteContratos, isResponsavelLegal, isContabilidade, isControleCompras, isJovemAprendiz } = context;
  
  // Verifica se tem outros papéis além de contabilidade
  const temOutrosPapeis = isGestor || isCompliance || isColaborador || isSuperintendenteExecutivo || isGerenteContratos || isResponsavelLegal || isControleCompras || isJovemAprendiz;
  
  return isContabilidade && !temOutrosPapeis;
}

// Helper para verificar se pode regenerar senha (apenas Gestor, Superintendente Executivo ou Compliance)
export function useCanResetPassword() {
  const context = useOutletContext<UserContextType>();
  
  if (!context) return false;
  
  const { isGestor, isCompliance, isSuperintendenteExecutivo } = context;
  
  return isGestor || isCompliance || isSuperintendenteExecutivo;
}
