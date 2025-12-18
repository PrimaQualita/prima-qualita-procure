import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Database, HardDrive, AlertTriangle, CheckCircle2, Eye, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DialogGrupoDetalhes } from "@/components/storage/DialogGrupoDetalhes";
import { DialogArquivosOrfaos } from "@/components/storage/DialogArquivosOrfaos";
import { DialogDocumentosSimples } from "@/components/storage/DialogDocumentosSimples";
import { DialogHabilitacao } from "@/components/storage/DialogHabilitacao";
import { DialogRecursos } from "@/components/storage/DialogRecursos";
import { DialogDocumentosAntigos } from "@/components/storage/DialogDocumentosAntigos";

export default function GestaoStorage() {
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [limpando, setLimpando] = useState(false);
  const [grupoDetalhes, setGrupoDetalhes] = useState<{titulo: string, tipo: string, grupos: any[], categoria?: string} | null>(null);
  const [documentosGrupo, setDocumentosGrupo] = useState<{nome: string, documentos: any[]} | null>(null);
  const [dialogOrfaosAberto, setDialogOrfaosAberto] = useState(false);
  const [dialogHabilitacaoAberto, setDialogHabilitacaoAberto] = useState(false);
  const [dialogRecursosAberto, setDialogRecursosAberto] = useState(false);
  const [dialogDocumentosAntigosAberto, setDialogDocumentosAntigosAberto] = useState(false);

  const executarAnalise = async () => {
    setAnalisando(true);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('analisar-storage');
      
      if (error) throw error;
      
      setResultado(data);
      toast.success('Análise concluída!');
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setAnalisando(false);
    }
  };

  const limparArquivos = async () => {
    if (!resultado?.arquivosOrfaos?.length) return;

    setLimpando(true);
    try {
      // Extrair apenas os paths dos objetos
      const paths = resultado.arquivosOrfaos.map((arq: any) => 
        typeof arq === 'string' ? arq : arq.path
      );
      
      const { data, error } = await supabase.functions.invoke('limpar-storage', {
        body: { tipo: 'arquivos', paths }
      });

      if (error) throw error;

      toast.success(`${data.deletados} arquivos deletados (${resultado.tamanhoOrfaosMB} MB liberados)`);
      await executarAnalise();
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setLimpando(false);
    }
  };

  const limparReferencias = async () => {
    if (!resultado?.referenciasOrfas?.length) {
      console.log('Nenhuma referência órfã para limpar');
      toast.error('Nenhuma referência órfã para limpar');
      return;
    }

    console.log('Iniciando limpeza de referências:', resultado.referenciasOrfas.length);
    setLimpando(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('limpar-storage', {
        body: { tipo: 'referencias', paths: resultado.referenciasOrfas }
      });

      console.log('Resposta da edge function:', { data, error });

      if (error) {
        console.error('Erro da edge function:', error);
        throw error;
      }

      toast.success(`${data?.deletados || 0} referências deletadas`);
      await executarAnalise();
    } catch (error: any) {
      console.error('Erro ao limpar referências:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setLimpando(false);
    }
  };

  const limparTudo = async () => {
    const confirma1 = window.confirm(
      `⚠️ ATENÇÃO CRÍTICA! ⚠️\n\nEsta ação vai DELETAR TUDO:\n\n` +
      `• TODOS os ${resultado?.totalArquivosStorage || '?'} arquivos do storage (${resultado?.tamanhoTotalMB || '?'} MB)\n` +
      `• TODOS os registros do banco de dados\n` +
      `• Fornecedores, processos, cotações, seleções\n` +
      `• Documentos, propostas, atas, recursos\n` +
      `• TUDO será PERMANENTEMENTE DELETADO!\n\n` +
      `Esta ação é IRREVERSÍVEL!\n\n` +
      `Tem CERTEZA ABSOLUTA?`
    );

    if (!confirma1) return;

    const confirma2 = window.prompt(
      `ÚLTIMA CONFIRMAÇÃO!\n\n` +
      `Digite "DELETAR TUDO" (sem aspas) para confirmar a destruição completa do sistema:`
    );

    if (confirma2 !== 'DELETAR TUDO') {
      toast.error('Limpeza cancelada');
      return;
    }

    setLimpando(true);
    try {
      toast.info('Iniciando limpeza total do sistema...');
      
      const { data, error } = await supabase.functions.invoke('limpar-tudo', {});

      if (error) throw error;

      toast.success(
        `✅ Sistema completamente limpo!\n` +
        `${data.arquivos_deletados} arquivos deletados\n` +
        `${data.registros_deletados || 'Múltiplos'} registros removidos`,
        { duration: 10000 }
      );
      
      // Aguardar um pouco antes de recarregar a análise
      setTimeout(() => executarAnalise(), 2000);
    } catch (error: any) {
      console.error('Erro ao limpar sistema:', error);
      toast.error(`Erro fatal: ${error.message}`);
    } finally {
      setLimpando(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestão de Storage</h1>
        <p className="text-muted-foreground">
          Identifique e limpe arquivos e referências órfãs
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Análise de Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={executarAnalise}
            disabled={analisando}
            size="lg"
          >
            {analisando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {analisando ? 'Analisando...' : 'Iniciar Análise'}
          </Button>

          {resultado && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium text-green-900">Arquivos no Storage</p>
                      </div>
                      <p className="text-3xl font-bold text-green-700">{resultado.totalArquivosStorage}</p>
                      <p className="text-lg font-semibold text-green-600 mt-1">
                        {resultado.tamanhoTotalMB} MB
                      </p>
                      <p className="text-xs text-green-700/80 mt-1">
                        Total de arquivos e espaço ocupado
                      </p>
                    </div>
                    <HardDrive className="h-10 w-10 text-green-600/40" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-900">Referências no Banco</p>
                      </div>
                      <p className="text-3xl font-bold text-blue-700">{resultado.totalReferenciasDB}</p>
                      <p className="text-xs text-blue-700/80 mt-1">
                        URLs registradas no banco de dados
                      </p>
                    </div>
                    <Database className="h-10 w-10 text-blue-600/40" />
                  </div>
                </CardContent>
              </Card>

              {/* Estatísticas Detalhadas por Categoria - Ordenadas Alfabeticamente */}
              {[
                // Análises de Compliance
                {
                  key: 'analises_compliance',
                  title: 'Análises de Compliance',
                  colorClass: 'border-purple-200 bg-purple-50/50',
                  description: 'Pareceres compliance',
                  data: resultado.estatisticasPorCategoria?.analises_compliance,
                  viewType: 'processo',
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Análises de Compliance',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.analises_compliance?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.analises_compliance?.porProcesso?.length > 0
                },
                // Atas do Certame
                {
                  key: 'atas_certame',
                  title: 'Atas do Certame',
                  colorClass: 'border-rose-200 bg-rose-50/50',
                  description: 'Atas de Seleção',
                  data: resultado.estatisticasPorCategoria?.atas_certame,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Atas do Certame',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.atas_certame?.porProcesso || [],
                    categoria: 'atas_certame'
                  }),
                  showView: resultado.estatisticasPorCategoria?.atas_certame?.porProcesso?.length > 0
                },
                // Autorização da Despesa
                {
                  key: 'autorizacao_despesa',
                  title: 'Autorização da Despesa',
                  colorClass: 'border-fuchsia-200 bg-fuchsia-50/50',
                  description: 'Anexadas em processos',
                  data: resultado.estatisticasPorCategoria?.autorizacao_despesa,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Autorização da Despesa',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.autorizacao_despesa?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.autorizacao_despesa?.porProcesso?.length > 0
                },
                // Autorizações Compra Direta
                {
                  key: 'autorizacoes_compra_direta',
                  title: 'Autorizações Compra Direta',
                  colorClass: 'border-green-200 bg-green-50/50',
                  description: 'PDFs de autorização',
                  data: resultado.estatisticasPorCategoria?.autorizacoes_compra_direta,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Autorizações de Compra Direta',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.autorizacoes_compra_direta?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.autorizacoes_compra_direta?.porProcesso?.length > 0
                },
                // Autorizações Seleção
                {
                  key: 'autorizacoes_selecao',
                  title: 'Autorizações Seleção',
                  colorClass: 'border-emerald-200 bg-emerald-50/50',
                  description: 'PDFs de autorização seleção',
                  data: resultado.estatisticasPorCategoria?.autorizacoes_selecao,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Autorizações de Seleção de Fornecedores',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.autorizacoes_selecao?.porProcesso || [],
                    categoria: 'autorizacoes_selecao'
                  }),
                  showView: resultado.estatisticasPorCategoria?.autorizacoes_selecao?.porProcesso?.length > 0
                },
                // Avisos de Certame
                {
                  key: 'avisos_certame',
                  title: 'Avisos de Certame',
                  colorClass: 'border-cyan-200 bg-cyan-50/50',
                  description: 'Seleção / Credenciamento',
                  data: resultado.estatisticasPorCategoria?.avisos_certame,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Avisos de Certame',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.avisos_certame?.porProcesso || [],
                    categoria: 'avisos_certame'
                  }),
                  showView: resultado.estatisticasPorCategoria?.avisos_certame?.porProcesso?.length > 0
                },
                // Capas Processo
                {
                  key: 'capas_processo',
                  title: 'Capas Processo',
                  colorClass: 'border-sky-200 bg-sky-50/50',
                  description: 'PDFs de capa',
                  data: resultado.estatisticasPorCategoria?.capas_processo,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Capas de Processo',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.capas_processo?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.capas_processo?.porProcesso?.length > 0
                },
                // Cotações
                {
                  key: 'cotacoes',
                  title: 'Cotações',
                  colorClass: 'border-blue-200 bg-blue-50/50',
                  description: 'Propostas e planilhas',
                  data: resultado.estatisticasPorCategoria?.cotacoes,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Cotações por Processo',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.cotacoes?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.cotacoes?.porProcesso?.length > 0
                },
                // Docs Cadastro
                {
                  key: 'documentos_fornecedores',
                  title: 'Docs Cadastro',
                  colorClass: 'border-purple-200 bg-purple-50/50',
                  description: 'CNDs, CNPJ, Relatórios KPMG',
                  data: resultado.estatisticasPorCategoria?.documentos_fornecedores,
                  viewType: 'fornecedor',
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Documentos de Cadastro',
                    tipo: 'fornecedor',
                    grupos: resultado.estatisticasPorCategoria?.documentos_fornecedores?.porFornecedor || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.documentos_fornecedores?.porFornecedor?.length > 0
                },
                // Documentos Antigos
                {
                  key: 'documentos_antigos',
                  title: 'Documentos Antigos',
                  colorClass: 'border-stone-200 bg-stone-50/50',
                  description: 'Certidões substituídas',
                  data: resultado.estatisticasPorCategoria?.documentos_antigos,
                  onClick: () => setDialogDocumentosAntigosAberto(true),
                  showView: resultado.estatisticasPorCategoria?.documentos_antigos?.porFornecedor?.length > 0,
                  hasIcon: true
                },
                // Editais
                {
                  key: 'editais',
                  title: 'Editais',
                  colorClass: 'border-indigo-200 bg-indigo-50/50',
                  description: 'Seleção / Credenciamento',
                  data: resultado.estatisticasPorCategoria?.editais,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Editais',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.editais?.porProcesso || [],
                    categoria: 'editais'
                  }),
                  showView: resultado.estatisticasPorCategoria?.editais?.porProcesso?.length > 0
                },
                // Encaminhamentos
                {
                  key: 'encaminhamentos',
                  title: 'Encaminhamentos',
                  colorClass: 'border-emerald-200 bg-emerald-50/50',
                  description: 'PDFs oficiais',
                  data: resultado.estatisticasPorCategoria?.encaminhamentos,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Encaminhamentos',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.encaminhamentos?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.encaminhamentos?.porProcesso?.length > 0
                },
                // Habilitação
                {
                  key: 'habilitacao',
                  title: 'Habilitação',
                  colorClass: 'border-rose-200 bg-rose-50/50',
                  description: 'Docs solicitados',
                  data: resultado.estatisticasPorCategoria?.habilitacao,
                  onClick: () => setDialogHabilitacaoAberto(true),
                  showView: resultado.estatisticasPorCategoria?.habilitacao?.porProcesso?.length > 0
                },
                // Homologações
                {
                  key: 'homologacoes',
                  title: 'Homologações',
                  colorClass: 'border-violet-200 bg-violet-50/50',
                  description: 'Homologações de Seleção',
                  data: resultado.estatisticasPorCategoria?.homologacoes,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Homologações',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.homologacoes?.porProcesso || [],
                    categoria: 'homologacoes'
                  }),
                  showView: resultado.estatisticasPorCategoria?.homologacoes?.porProcesso?.length > 0
                },
                // Outros
                {
                  key: 'outros',
                  title: 'Outros',
                  colorClass: 'border-slate-200 bg-slate-50/50',
                  description: 'Não categorizados',
                  data: resultado.estatisticasPorCategoria?.outros,
                  onClick: () => setDocumentosGrupo({
                    nome: 'Outros (Não Categorizados)',
                    documentos: resultado.estatisticasPorCategoria?.outros?.detalhes || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.outros?.detalhes?.length > 0
                },
                // Outros Anexos Processos
                {
                  key: 'processos_anexos_outros',
                  title: 'Outros Anexos Processos',
                  colorClass: 'border-rose-200 bg-rose-50/50',
                  description: 'Outros anexos',
                  data: resultado.estatisticasPorCategoria?.processos_anexos_outros,
                  onClick: () => setDocumentosGrupo({
                    nome: 'Outros Anexos de Processos',
                    documentos: resultado.estatisticasPorCategoria?.processos_anexos_outros?.detalhes || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.processos_anexos_outros?.detalhes?.length > 0
                },
                // Planilhas Finais
                {
                  key: 'planilhas_finais',
                  title: 'Planilhas Finais',
                  colorClass: 'border-pink-200 bg-pink-50/50',
                  description: 'Resultado final de habilitação',
                  data: resultado.estatisticasPorCategoria?.planilhas_finais,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Planilhas Finais',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.planilhas_finais?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.planilhas_finais?.porProcesso?.length > 0
                },
                // Planilhas Lances
                {
                  key: 'planilhas_lances',
                  title: 'Planilhas Lances',
                  colorClass: 'border-teal-200 bg-teal-50/50',
                  description: 'Consolidadas',
                  data: resultado.estatisticasPorCategoria?.planilhas_lances,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Planilhas de Lances',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.planilhas_lances?.porProcesso || [],
                    categoria: 'planilhas_lances'
                  }),
                  showView: resultado.estatisticasPorCategoria?.planilhas_lances?.arquivos > 0
                },
                // Processos Finalizados
                {
                  key: 'processos_finalizados',
                  title: 'Processos Finalizados',
                  colorClass: 'border-orange-200 bg-orange-50/50',
                  description: 'PDFs mesclados completos',
                  data: resultado.estatisticasPorCategoria?.processos_finalizados,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Processos Finalizados',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.processos_finalizados?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.processos_finalizados?.porProcesso?.length > 0
                },
                // Propostas Seleção
                {
                  key: 'propostas_selecao',
                  title: 'Propostas Seleção',
                  colorClass: 'border-indigo-200 bg-indigo-50/50',
                  description: 'PDFs de propostas',
                  data: resultado.estatisticasPorCategoria?.propostas_selecao,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Propostas de Seleção',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.propostas_selecao?.porProcesso || [],
                    categoria: 'propostas_selecao'
                  }),
                  showView: resultado.estatisticasPorCategoria?.propostas_selecao?.arquivos > 0
                },
                // Propostas Realinhadas
                {
                  key: 'propostas_realinhadas',
                  title: 'Propostas Realinhadas',
                  colorClass: 'border-cyan-200 bg-cyan-50/50',
                  description: 'PDFs realinhados',
                  data: resultado.estatisticasPorCategoria?.propostas_realinhadas,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Propostas Realinhadas',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.propostas_realinhadas?.porProcesso || [],
                    categoria: 'propostas_realinhadas'
                  }),
                  showView: resultado.estatisticasPorCategoria?.propostas_realinhadas?.arquivos > 0
                },
                // Recursos
                {
                  key: 'recursos',
                  title: 'Recursos',
                  colorClass: 'border-amber-200 bg-amber-50/50',
                  description: 'Enviados e respostas',
                  data: resultado.estatisticasPorCategoria?.recursos,
                  onClick: () => setDialogRecursosAberto(true),
                  showView: resultado.estatisticasPorCategoria?.recursos?.arquivos > 0
                },
                // Relatórios Finais
                {
                  key: 'relatorios_finais',
                  title: 'Relatórios Finais',
                  colorClass: 'border-lime-200 bg-lime-50/50',
                  description: 'PDFs de relatório final',
                  data: resultado.estatisticasPorCategoria?.relatorios_finais,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Relatórios Finais',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.relatorios_finais?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.relatorios_finais?.porProcesso?.length > 0
                },
                // Requisições
                {
                  key: 'requisicoes',
                  title: 'Requisições',
                  colorClass: 'border-violet-200 bg-violet-50/50',
                  description: 'Anexadas em processos',
                  data: resultado.estatisticasPorCategoria?.requisicoes,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Requisições',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.requisicoes?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.requisicoes?.porProcesso?.length > 0
                },
                // Termos de Referência
                {
                  key: 'termos_referencia',
                  title: 'Termos de Referência',
                  colorClass: 'border-indigo-200 bg-indigo-50/50',
                  description: 'Anexados em processos',
                  data: resultado.estatisticasPorCategoria?.termos_referencia,
                  onClick: () => setGrupoDetalhes({
                    titulo: 'Termos de Referência',
                    tipo: 'processo',
                    grupos: resultado.estatisticasPorCategoria?.termos_referencia?.porProcesso || []
                  }),
                  showView: resultado.estatisticasPorCategoria?.termos_referencia?.porProcesso?.length > 0
                }
              ]
              .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
              .map((cat) => {
                const colorMatch = cat.colorClass.match(/border-(\w+)-/);
                const color = colorMatch ? colorMatch[1] : 'slate';
                
                return (
                  <Card key={cat.key} className={cat.colorClass}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-1">
                            {cat.hasIcon && <Archive className={`h-4 w-4 text-${color}-600`} />}
                            <p className={`text-xs font-medium text-${color}-900`}>{cat.title}</p>
                          </div>
                          <p className={`text-2xl font-bold text-${color}-700`}>{cat.data?.arquivos || 0}</p>
                          <p className={`text-sm font-semibold text-${color}-600`}>
                            {cat.data?.tamanhoMB || 0} MB
                          </p>
                          <p className={`text-xs text-${color}-700/70`}>{cat.description}</p>
                        </div>
                        {cat.showView && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cat.onClick}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <Card className="lg:col-span-3 border-orange-200 bg-orange-50/30">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <p className="text-sm font-medium text-orange-900">Arquivos Órfãos no Storage</p>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div>
                          <p className="text-xl font-bold text-orange-700">{resultado.totalArquivosOrfaos}</p>
                          <p className="text-xs text-orange-700/80">arquivos órfãos</p>
                        </div>
                        <div className="border-l border-orange-300 pl-4">
                          <p className="text-lg font-semibold text-orange-600">
                            {resultado.tamanhoOrfaosMB || 0} MB
                          </p>
                          <p className="text-xs text-orange-700/80">espaço desperdiçado</p>
                        </div>
                      </div>
                      <p className="text-xs text-orange-700/80 mt-2">
                        Arquivos que existem no storage mas NÃO têm referência no banco
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {resultado.totalArquivosOrfaos > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDialogOrfaosAberto(true)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-3 border-red-200 bg-red-50/30">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <p className="text-sm font-medium text-red-900">Referências Órfãs no Banco</p>
                      </div>
                      <div className="text-xl font-bold text-red-700 flex items-center gap-2">
                        <span>{resultado.totalReferenciasOrfas}</span>
                        {resultado.totalReferenciasOrfas > 0 && (
                          <Badge variant="destructive">
                            Limpar
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-red-700/80 mt-1">
                        Registros no banco que apontam para arquivos que NÃO existem mais no storage (foram deletados)
                      </p>
                    </div>
                    {resultado.totalReferenciasOrfas > 0 && (
                      <Button
                        variant="destructive"
                        onClick={limparReferencias}
                        disabled={limpando}
                      >
                        {limpando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {resultado.referenciasOrfas?.length > 0 && (
                    <div className="text-xs text-muted-foreground max-h-40 overflow-y-auto space-y-1 bg-red-100/50 p-2 rounded border border-red-200">
                      {resultado.referenciasOrfas.slice(0, 10).map((ref: string, i: number) => {
                        // Identificar tipo de referência pelo path
                        let tipo = 'Desconhecido';
                        if (ref.includes('propostas/')) tipo = 'Proposta de Cotação';
                        else if (ref.includes('propostas_realinhadas/')) tipo = 'Proposta Realinhada';
                        else if (ref.includes('selecao_propostas/')) tipo = 'Proposta de Seleção';
                        else if (ref.includes('atas/')) tipo = 'Ata de Seleção';
                        else if (ref.includes('planilhas/')) tipo = 'Planilha';
                        else if (ref.includes('emails/')) tipo = 'Email Anexado';
                        else if (ref.includes('documentos_fornecedor/')) tipo = 'Documento Fornecedor';
                        else if (ref.includes('anexos_processo/')) tipo = 'Anexo de Processo';
                        else if (ref.includes('autorizacoes/')) tipo = 'Autorização';
                        else if (ref.includes('habilitacao/')) tipo = 'Habilitação';
                        else if (ref.includes('recursos/')) tipo = 'Recurso';
                        
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-red-200/50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <span className="text-red-800 font-medium text-[10px] bg-red-200 px-1.5 py-0.5 rounded mr-2">{tipo}</span>
                              <span className="truncate">{ref.split('/').pop()}</span>
                            </div>
                          </div>
                        );
                      })}
                      {resultado.totalReferenciasOrfas > 10 && (
                        <div className="text-center pt-1 text-red-600">... e mais {resultado.totalReferenciasOrfas - 10}</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <DialogGrupoDetalhes
        open={!!grupoDetalhes}
        onOpenChange={() => setGrupoDetalhes(null)}
        titulo={grupoDetalhes?.titulo || ''}
        tipo={grupoDetalhes?.tipo || ''}
        grupos={grupoDetalhes?.grupos || []}
        categoria={grupoDetalhes?.categoria}
      />

      <DialogDocumentosSimples
        open={!!documentosGrupo}
        onOpenChange={() => setDocumentosGrupo(null)}
        titulo={documentosGrupo?.nome || ''}
        documentos={documentosGrupo?.documentos || []}
      />

      <DialogArquivosOrfaos
        open={dialogOrfaosAberto}
        onOpenChange={setDialogOrfaosAberto}
        arquivos={resultado?.arquivosOrfaos || []}
        onArquivosDeletados={executarAnalise}
      />

      <DialogHabilitacao
        open={dialogHabilitacaoAberto}
        onOpenChange={setDialogHabilitacaoAberto}
        processos={resultado?.estatisticasPorCategoria?.habilitacao?.porProcesso || []}
      />

      <DialogRecursos
        open={dialogRecursosAberto}
        onOpenChange={setDialogRecursosAberto}
        processos={resultado?.estatisticasPorCategoria?.recursos?.porProcessoHierarquico || []}
      />

      <DialogDocumentosAntigos
        open={dialogDocumentosAntigosAberto}
        onOpenChange={setDialogDocumentosAntigosAberto}
        dados={resultado?.estatisticasPorCategoria?.documentos_antigos || null}
      />
    </div>
  );
}