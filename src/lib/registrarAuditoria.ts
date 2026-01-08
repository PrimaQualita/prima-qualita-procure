import { supabase } from "@/integrations/supabase/client";

interface RegistroAuditoria {
  acao: 'criação' | 'deleção' | 'atualização' | 'edição' | 'exclusão';
  entidade: string;
  entidade_id?: string;
  detalhes: Record<string, any>;
}

/**
 * Registra uma ação no log de auditoria
 * Esta função é segura e não bloqueia a operação principal em caso de erro
 */
export async function registrarAuditoria({
  acao,
  entidade,
  entidade_id,
  detalhes,
}: RegistroAuditoria): Promise<void> {
  try {
    // Buscar dados do usuário atual
    const { data: { user } } = await supabase.auth.getUser();
    
    let usuarioNome = 'Usuário não identificado';
    
    if (user) {
      // Buscar nome do usuário no perfil
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile?.nome_completo) {
        usuarioNome = profile.nome_completo;
      }
    }

    // Inserir log de auditoria
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        usuario_id: user?.id || null,
        usuario_nome: usuarioNome,
        usuario_tipo: 'interno',
        acao,
        entidade,
        entidade_id: entidade_id || null,
        detalhes,
      });

    if (error) {
      console.error('Erro ao registrar auditoria:', error);
      // Não lançamos erro para não bloquear a operação principal
    }
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
    // Silencioso - não deve impactar a operação principal
  }
}
