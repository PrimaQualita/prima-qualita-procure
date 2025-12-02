import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Database, HardDrive, AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DialogGrupoDetalhes } from "@/components/storage/DialogGrupoDetalhes";
import { DialogArquivosOrfaos } from "@/components/storage/DialogArquivosOrfaos";
import { DialogDocumentosSimples } from "@/components/storage/DialogDocumentosSimples";
import { DialogHabilitacao } from "@/components/storage/DialogHabilitacao";
import { DialogRecursos } from "@/components/storage/DialogRecursos";

export default function GestaoStorage() {
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [limpando, setLimpando] = useState(false);
  const [grupoDetalhes, setGrupoDetalhes] = useState<{titulo: string, tipo: string, grupos: any[]} | null>(null);
  const [documentosGrupo, setDocumentosGrupo] = useState<{nome: string, documentos: any[]} | null>(null);
  const [dialogOrfaosAberto, setDialogOrfaosAberto] = useState(false);
  const [dialogHabilitacaoAberto, setDialogHabilitacaoAberto] = useState(false);
  const [dialogRecursosAberto, setDialogRecursosAberto] = useState(false);

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

              {/* Estatísticas Detalhadas por Categoria */}
              <Card className="border-purple-200 bg-purple-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-purple-900">Docs Cadastro</p>
                      <p className="text-2xl font-bold text-purple-700">{resultado.estatisticasPorCategoria?.documentos_fornecedores?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-purple-600">
                        {resultado.estatisticasPorCategoria?.documentos_fornecedores?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-purple-700/70">CNDs, CNPJ, Relatórios KPMG</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.documentos_fornecedores?.porFornecedor?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Documentos de Cadastro',
                          tipo: 'fornecedor',
                          grupos: resultado.estatisticasPorCategoria.documentos_fornecedores.porFornecedor
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-indigo-200 bg-indigo-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-indigo-900">Propostas Seleção</p>
                      <p className="text-2xl font-bold text-indigo-700">{resultado.estatisticasPorCategoria?.propostas_selecao?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-indigo-600">
                        {resultado.estatisticasPorCategoria?.propostas_selecao?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-indigo-700/70">PDFs de propostas</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.propostas_selecao?.porSelecao?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Propostas de Seleção',
                          tipo: 'selecao',
                          grupos: resultado.estatisticasPorCategoria.propostas_selecao.porSelecao
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-cyan-200 bg-cyan-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-cyan-900">Anexos Seleção</p>
                      <p className="text-2xl font-bold text-cyan-700">{resultado.estatisticasPorCategoria?.anexos_selecao?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-cyan-600">
                        {resultado.estatisticasPorCategoria?.anexos_selecao?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-cyan-700/70">Avisos, editais</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.anexos_selecao?.porSelecao?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Anexos de Seleção',
                          tipo: 'selecao',
                          grupos: resultado.estatisticasPorCategoria.anexos_selecao.porSelecao
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-teal-200 bg-teal-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-teal-900">Planilhas Lances</p>
                      <p className="text-2xl font-bold text-teal-700">{resultado.estatisticasPorCategoria?.planilhas_lances?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-teal-600">
                        {resultado.estatisticasPorCategoria?.planilhas_lances?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-teal-700/70">Consolidadas</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.planilhas_lances?.porSelecao?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Planilhas de Lances',
                          tipo: 'selecao',
                          grupos: resultado.estatisticasPorCategoria.planilhas_lances.porSelecao
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-amber-900">Recursos</p>
                      <p className="text-2xl font-bold text-amber-700">{resultado.estatisticasPorCategoria?.recursos?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-amber-600">
                        {resultado.estatisticasPorCategoria?.recursos?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-amber-700/70">Enviados e respostas</p>
                    </div>
                    {(resultado.estatisticasPorCategoria?.recursos?.porProcessoHierarquico?.length > 0 || resultado.estatisticasPorCategoria?.recursos?.porSelecao?.length > 0) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialogRecursosAberto(true)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-emerald-900">Encaminhamentos</p>
                      <p className="text-2xl font-bold text-emerald-700">{resultado.estatisticasPorCategoria?.encaminhamentos?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-emerald-600">
                        {resultado.estatisticasPorCategoria?.encaminhamentos?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-emerald-700/70">PDFs oficiais</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.encaminhamentos?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Encaminhamentos',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.encaminhamentos.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-purple-200 bg-purple-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-purple-900">Análises de Compliance</p>
                      <p className="text-2xl font-bold text-purple-700">{resultado.estatisticasPorCategoria?.analises_compliance?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-purple-600">
                        {resultado.estatisticasPorCategoria?.analises_compliance?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-purple-700/70">Pareceres compliance</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.analises_compliance?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Análises de Compliance',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.analises_compliance.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-indigo-200 bg-indigo-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-indigo-900">Termos de Referência</p>
                      <p className="text-2xl font-bold text-indigo-700">{resultado.estatisticasPorCategoria?.termos_referencia?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-indigo-600">
                        {resultado.estatisticasPorCategoria?.termos_referencia?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-indigo-700/70">Anexados em processos</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.termos_referencia?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Termos de Referência',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.termos_referencia.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-violet-200 bg-violet-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-violet-900">Requisições</p>
                      <p className="text-2xl font-bold text-violet-700">{resultado.estatisticasPorCategoria?.requisicoes?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-violet-600">
                        {resultado.estatisticasPorCategoria?.requisicoes?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-violet-700/70">Anexadas em processos</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.requisicoes?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Requisições',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.requisicoes.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-fuchsia-200 bg-fuchsia-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-fuchsia-900">Autorização da Despesa</p>
                      <p className="text-2xl font-bold text-fuchsia-700">{resultado.estatisticasPorCategoria?.autorizacao_despesa?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-fuchsia-600">
                        {resultado.estatisticasPorCategoria?.autorizacao_despesa?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-fuchsia-700/70">Anexadas em processos</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.autorizacao_despesa?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Autorização da Despesa',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.autorizacao_despesa.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-rose-200 bg-rose-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-rose-900">Outros Anexos Processos</p>
                      <p className="text-2xl font-bold text-rose-700">{resultado.estatisticasPorCategoria?.processos_anexos_outros?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-rose-600">
                        {resultado.estatisticasPorCategoria?.processos_anexos_outros?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-rose-700/70">Outros anexos</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.processos_anexos_outros?.detalhes?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDocumentosGrupo({
                          nome: 'Outros Anexos de Processos',
                          documentos: resultado.estatisticasPorCategoria.processos_anexos_outros.detalhes
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-blue-900">Cotações</p>
                      <p className="text-2xl font-bold text-blue-700">{resultado.estatisticasPorCategoria?.cotacoes?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-blue-600">
                        {resultado.estatisticasPorCategoria?.cotacoes?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-blue-700/70">Propostas e planilhas</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.cotacoes?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Cotações por Processo',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.cotacoes.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-sky-200 bg-sky-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-sky-900">Capas Processo</p>
                      <p className="text-2xl font-bold text-sky-700">{resultado.estatisticasPorCategoria?.capas_processo?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-sky-600">
                        {resultado.estatisticasPorCategoria?.capas_processo?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-sky-700/70">PDFs de capa</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.capas_processo?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Capas de Processo',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.capas_processo.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-rose-200 bg-rose-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-rose-900">Habilitação</p>
                      <p className="text-2xl font-bold text-rose-700">{resultado.estatisticasPorCategoria?.habilitacao?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-rose-600">
                        {resultado.estatisticasPorCategoria?.habilitacao?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-rose-700/70">Docs solicitados</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.habilitacao?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialogHabilitacaoAberto(true)}
                        title="Ver por Processo → Fornecedor"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-lime-200 bg-lime-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-lime-900">Relatórios Finais</p>
                      <p className="text-2xl font-bold text-lime-700">{resultado.estatisticasPorCategoria?.relatorios_finais?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-lime-600">
                        {resultado.estatisticasPorCategoria?.relatorios_finais?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-lime-700/70">PDFs de relatório final</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.relatorios_finais?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Relatórios Finais',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.relatorios_finais.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-green-900">Autorizações Compra Direta</p>
                      <p className="text-2xl font-bold text-green-700">{resultado.estatisticasPorCategoria?.autorizacoes_compra_direta?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-green-600">
                        {resultado.estatisticasPorCategoria?.autorizacoes_compra_direta?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-green-700/70">PDFs de autorização</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.autorizacoes_compra_direta?.porProcesso?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGrupoDetalhes({
                          titulo: 'Autorizações de Compra Direta',
                          tipo: 'processo',
                          grupos: resultado.estatisticasPorCategoria.autorizacoes_compra_direta.porProcesso
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-2 flex-1">
                      <p className="text-xs font-medium text-slate-900">Outros</p>
                      <p className="text-2xl font-bold text-slate-700">{resultado.estatisticasPorCategoria?.outros?.arquivos || 0}</p>
                      <p className="text-sm font-semibold text-slate-600">
                        {resultado.estatisticasPorCategoria?.outros?.tamanhoMB || 0} MB
                      </p>
                      <p className="text-xs text-slate-700/70">Não categorizados</p>
                    </div>
                    {resultado.estatisticasPorCategoria?.outros?.detalhes?.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDocumentosGrupo({
                          nome: 'Outros (Não Categorizados)',
                          documentos: resultado.estatisticasPorCategoria.outros.detalhes
                        })}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

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
                    <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
                      {resultado.referenciasOrfas.slice(0, 10).map((ref: string, i: number) => (
                        <div key={i}>{ref}</div>
                      ))}
                      {resultado.totalReferenciasOrfas > 10 && (
                        <div>... e mais {resultado.totalReferenciasOrfas - 10}</div>
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
    </div>
  );
}