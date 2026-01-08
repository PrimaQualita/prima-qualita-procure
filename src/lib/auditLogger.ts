import { supabase } from "@/integrations/supabase/client";

type AcaoAuditoria = 
  | "criar" 
  | "editar" 
  | "excluir" 
  | "enviar" 
  | "receber" 
  | "aprovar" 
  | "rejeitar" 
  | "visualizar"
  | "download"
  | "upload";

interface RegistrarLogParams {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId?: string;
  detalhes?: Record<string, any>;
  usuarioNome?: string;
  usuarioTipo?: "interno" | "externo" | "fornecedor" | "sistema";
}

/**
 * Registra uma ação no log de auditoria
 */
export async function registrarAuditoria({
  acao,
  entidade,
  entidadeId,
  detalhes,
  usuarioNome,
  usuarioTipo = "interno",
}: RegistrarLogParams): Promise<void> {
  try {
    // Buscar usuário atual se não fornecido
    let nomeUsuario = usuarioNome;
    let tipoUsuario = usuarioTipo;
    let userId: string | null = null;

    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      userId = user.id;
      
      // Tentar buscar o nome do perfil interno
      if (!nomeUsuario) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome_completo")
          .eq("id", user.id)
          .maybeSingle();
        
        if (profile?.nome_completo) {
          nomeUsuario = profile.nome_completo;
          tipoUsuario = "interno";
        } else {
          // Tentar buscar como fornecedor
          const { data: fornecedor } = await supabase
            .from("fornecedores")
            .select("razao_social")
            .eq("user_id", user.id)
            .maybeSingle();
          
          if (fornecedor?.razao_social) {
            nomeUsuario = fornecedor.razao_social;
            tipoUsuario = "fornecedor";
          }
        }
      }
    }

    // Inserir log
    const { error } = await supabase.from("audit_logs").insert({
      acao,
      entidade,
      entidade_id: entidadeId,
      usuario_id: userId,
      usuario_nome: nomeUsuario || "Usuário não identificado",
      usuario_tipo: tipoUsuario,
      detalhes: detalhes || null,
    });

    if (error) {
      console.error("Erro ao registrar log de auditoria:", error);
    }
  } catch (err) {
    console.error("Erro ao registrar auditoria:", err);
  }
}

/**
 * Formata o nome amigável de uma entidade
 */
export function formatarNomeEntidade(tipo: string): string {
  const mapa: Record<string, string> = {
    processo: "Processo de Compra",
    cotacao: "Cotação de Preços",
    selecao: "Seleção de Fornecedores",
    proposta: "Proposta de Fornecedor",
    ata: "Ata de Seleção",
    homologacao: "Homologação",
    autorizacao: "Autorização de Despesa",
    encaminhamento: "Encaminhamento",
    encaminhamento_contabilidade: "Encaminhamento à Contabilidade",
    relatorio_final: "Relatório Final",
    analise_compliance: "Análise de Compliance",
    planilha_consolidada: "Planilha Consolidada",
    planilha_habilitacao: "Planilha de Habilitação",
    recurso: "Recurso de Fornecedor",
    resposta_recurso: "Resposta de Recurso",
    aviso_selecao: "Aviso de Seleção",
    edital_selecao: "Edital de Seleção",
    contrato: "Contrato de Gestão",
    fornecedor: "Cadastro de Fornecedor",
    usuario: "Usuário",
    documento: "Documento",
    anexo: "Anexo",
  };
  
  return mapa[tipo] || tipo;
}
