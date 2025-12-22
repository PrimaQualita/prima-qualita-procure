import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Eye, ChevronRight, ArrowLeft, CheckCircle, Clock, MessageSquare, Send, FolderOpen, FileDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";
import { gerarRespostaContabilidadePDF, gerarProtocoloRespostaContabilidade } from "@/lib/gerarRespostaContabilidadePDF";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface FornecedorVencedor {
  razaoSocial: string;
  cnpj: string;
}

interface ProcessoContabilidade {
  id: string;
  cotacao_id: string;
  processo_numero: string;
  objeto_processo: string;
  fornecedores_vencedores: FornecedorVencedor[];
  protocolo: string;
  url_arquivo: string;
  nome_arquivo: string;
  usuario_gerador_nome: string;
  data_geracao: string;
  enviado_contabilidade: boolean;
  data_envio_contabilidade: string | null;
  respondido_contabilidade: boolean;
  data_resposta_contabilidade: string | null;
  resposta_contabilidade: string | null;
  tipos_operacao_fornecedores: { cnpj: string; tipoOperacao: string }[] | null;
  url_resposta_pdf: string | null;
  protocolo_resposta: string | null;
  storage_path_resposta?: string | null;
  contrato_gestao_id?: string;
}

export default function Contabilidade() {
  const [contratos, setContratos] = useState<ContratoGestao[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<ContratoGestao | null>(null);
  const [processos, setProcessos] = useState<Record<string, ProcessoContabilidade[]>>({});
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [dialogRespostaOpen, setDialogRespostaOpen] = useState(false);
  const [processoSelecionado, setProcessoSelecionado] = useState<ProcessoContabilidade | null>(null);
  const [tiposOperacao, setTiposOperacao] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [dialogExcluirOpen, setDialogExcluirOpen] = useState(false);
  const [processoParaExcluir, setProcessoParaExcluir] = useState<ProcessoContabilidade | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    loadData();
    
    const handleFocus = () => {
      loadData();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const loadData = async () => {
    try {
      console.log("📊 [Contabilidade] Iniciando carregamento de dados...");
      
      // Buscar todos os contratos
      const { data: contratosData, error: contratosError } = await supabase
        .from("contratos_gestao")
        .select("*")
        .order("nome_contrato");

      if (contratosError) throw contratosError;

      // Buscar encaminhamentos de contabilidade que foram enviados
      const { data: encaminhamentosData, error: encaminhamentosError } = await supabase
        .from("encaminhamentos_contabilidade")
        .select("*")
        .eq("enviado_contabilidade", true)
        .order("data_envio_contabilidade", { ascending: false });

      if (encaminhamentosError) throw encaminhamentosError;

      console.log("📋 [Contabilidade] Encaminhamentos carregados:", encaminhamentosData?.length || 0);

      // Buscar cotações para obter o contrato_gestao_id através do processo
      const cotacaoIds = [...new Set(encaminhamentosData?.map(e => e.cotacao_id) || [])];
      
      let processosMap: Record<string, string> = {};
      
      if (cotacaoIds.length > 0) {
        const { data: cotacoesData, error: cotacoesError } = await supabase
          .from("cotacoes_precos")
          .select(`
            id,
            processos_compras!inner (
              contrato_gestao_id
            )
          `)
          .in("id", cotacaoIds);

        if (!cotacoesError && cotacoesData) {
          cotacoesData.forEach((c: any) => {
            processosMap[c.id] = c.processos_compras?.contrato_gestao_id;
          });
        }
      }

      // Agrupar processos por contrato
      const processosAgrupados: Record<string, ProcessoContabilidade[]> = {};
      
      encaminhamentosData?.forEach((encaminhamento: any) => {
        const contratoId = processosMap[encaminhamento.cotacao_id];
        
        if (contratoId) {
          if (!processosAgrupados[contratoId]) {
            processosAgrupados[contratoId] = [];
          }
          
          processosAgrupados[contratoId].push({
            ...encaminhamento,
            contrato_gestao_id: contratoId
          });
        }
      });

      setContratos(contratosData || []);
      setProcessos(processosAgrupados);
      
      console.log("✅ [Contabilidade] Carregamento concluído");
    } catch (error: any) {
      console.error("❌ [Contabilidade] Erro ao carregar processos:", error);
      toast.error("Erro ao carregar processos de contabilidade");
    } finally {
      setLoading(false);
    }
  };

  const visualizarDocumento = (url: string) => {
    window.open(url, '_blank');
  };

  const abrirDialogResposta = (processo: ProcessoContabilidade) => {
    setProcessoSelecionado(processo);
    
    // Inicializar tipos de operação a partir dos dados salvos ou vazio
    const tiposIniciais: Record<string, string> = {};
    if (processo.tipos_operacao_fornecedores && Array.isArray(processo.tipos_operacao_fornecedores)) {
      processo.tipos_operacao_fornecedores.forEach((item) => {
        tiposIniciais[item.cnpj] = item.tipoOperacao;
      });
    }
    setTiposOperacao(tiposIniciais);
    setDialogRespostaOpen(true);
  };

  const handleTipoOperacaoChange = (cnpj: string, valor: string) => {
    // Permitir apenas números e letras maiúsculas
    const valorFormatado = valor.toUpperCase().replace(/[^A-Z0-9.]/g, '');
    setTiposOperacao(prev => ({
      ...prev,
      [cnpj]: valorFormatado
    }));
  };

  const todosCamposPreenchidos = (): boolean => {
    if (!processoSelecionado) return false;
    return processoSelecionado.fornecedores_vencedores.every(
      f => tiposOperacao[f.cnpj] && tiposOperacao[f.cnpj].trim().length > 0
    );
  };

  const salvarResposta = async () => {
    if (!processoSelecionado || !todosCamposPreenchidos()) {
      toast.error("Preencha o tipo de operação para todos os fornecedores");
      return;
    }

    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase
        .from("profiles")
        .select("nome_completo")
        .eq("id", userData?.user?.id)
        .single();

      // Preparar dados dos tipos de operação
      const tiposOperacaoArray = processoSelecionado.fornecedores_vencedores.map(f => ({
        cnpj: f.cnpj,
        tipoOperacao: tiposOperacao[f.cnpj] || ""
      }));

      // Preparar fornecedores para o PDF
      const fornecedoresParaPDF = processoSelecionado.fornecedores_vencedores.map(f => ({
        razaoSocial: f.razaoSocial,
        cnpj: f.cnpj,
        tipoOperacao: tiposOperacao[f.cnpj] || ""
      }));

      // Gerar protocolo e PDF
      const protocolo = gerarProtocoloRespostaContabilidade();
      const resultado = await gerarRespostaContabilidadePDF({
        numeroProcesso: processoSelecionado.processo_numero,
        objetoProcesso: processoSelecionado.objeto_processo,
        fornecedores: fornecedoresParaPDF,
        usuarioNome: profileData?.nome_completo || "Usuário",
        protocolo
      });

      // Atualizar encaminhamento
      const { error } = await supabase
        .from("encaminhamentos_contabilidade")
        .update({
          respondido_contabilidade: true,
          data_resposta_contabilidade: new Date().toISOString(),
          resposta_contabilidade: fornecedoresParaPDF.map(f => `${f.razaoSocial}: ${f.tipoOperacao}`).join("; "),
          tipos_operacao_fornecedores: tiposOperacaoArray,
          url_resposta_pdf: resultado.url,
          protocolo_resposta: resultado.protocolo,
          storage_path_resposta: resultado.storagePath,
          usuario_resposta_id: userData?.user?.id
        })
        .eq("id", processoSelecionado.id);

      if (error) throw error;

      toast.success("Resposta salva e PDF gerado com sucesso!");
      setDialogRespostaOpen(false);
      setProcessoSelecionado(null);
      setTiposOperacao({});
      loadData();

      // Abrir PDF em nova aba
      window.open(resultado.url, '_blank');
    } catch (error: any) {
      console.error("Erro ao salvar resposta:", error);
      toast.error("Erro ao salvar resposta");
    } finally {
      setSalvando(false);
    }
  };

  const abrirDialogExcluir = (processo: ProcessoContabilidade) => {
    setProcessoParaExcluir(processo);
    setDialogExcluirOpen(true);
  };

  const excluirResposta = async () => {
    if (!processoParaExcluir) return;

    setExcluindo(true);
    try {
      // Deletar arquivo do storage se existir
      if (processoParaExcluir.storage_path_resposta) {
        await supabase.storage
          .from('processo-anexos')
          .remove([processoParaExcluir.storage_path_resposta]);
      }

      // Limpar campos de resposta no encaminhamento
      const { error } = await supabase
        .from("encaminhamentos_contabilidade")
        .update({
          respondido_contabilidade: false,
          data_resposta_contabilidade: null,
          resposta_contabilidade: null,
          tipos_operacao_fornecedores: null,
          url_resposta_pdf: null,
          protocolo_resposta: null,
          storage_path_resposta: null,
          usuario_resposta_id: null
        })
        .eq("id", processoParaExcluir.id);

      if (error) throw error;

      toast.success("Resposta excluída com sucesso! O processo voltou para pendente.");
      setDialogExcluirOpen(false);
      setProcessoParaExcluir(null);
      loadData();
    } catch (error: any) {
      console.error("Erro ao excluir resposta:", error);
      toast.error("Erro ao excluir resposta");
    } finally {
      setExcluindo(false);
    }
  };

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatarCNPJ = (cnpj: string): string => {
    const numeros = cnpj.replace(/\D/g, '');
    if (numeros.length !== 14) return cnpj;
    return `${numeros.slice(0,2)}.${numeros.slice(2,5)}.${numeros.slice(5,8)}/${numeros.slice(8,12)}-${numeros.slice(12,14)}`;
  };

  const contratosFiltrados = contratos.filter((contrato) =>
    contrato.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    contrato.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  // Contar pendentes por contrato
  const contarPendentes = (contratoId: string): number => {
    return (processos[contratoId] || []).filter(p => !p.respondido_contabilidade).length;
  };

  // Contar respondidos por contrato
  const contarRespondidos = (contratoId: string): number => {
    return (processos[contratoId] || []).filter(p => p.respondido_contabilidade).length;
  };

  // Total de pendentes
  const totalPendentes = Object.values(processos).flat().filter(p => !p.respondido_contabilidade).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        ) : !contratoSelecionado ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Contabilidade
              </CardTitle>
              <CardDescription>
                Gerencie os encaminhamentos recebidos do Departamento de Compras
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Buscar por nome ou ente federativo..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="mb-4"
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Contrato</TableHead>
                    <TableHead>Ente Federativo</TableHead>
                    <TableHead className="text-center">Processos Pendentes</TableHead>
                    <TableHead className="text-center">Processos Respondidos</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.map((contrato) => {
                    const pendentes = contarPendentes(contrato.id);
                    const respondidos = contarRespondidos(contrato.id);
                    const total = pendentes + respondidos;
                    
                    return (
                      <TableRow key={contrato.id}>
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell className="text-center">
                          {pendentes > 0 ? (
                            <Badge variant="destructive">{pendentes}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {respondidos > 0 ? (
                            <Badge className="bg-primary">{respondidos}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setContratoSelecionado(contrato)}
                            disabled={total === 0}
                            className="flex items-center gap-1"
                          >
                            Ver Processos
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setContratoSelecionado(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <CardTitle>{contratoSelecionado.nome_contrato}</CardTitle>
                  <CardDescription>{contratoSelecionado.ente_federativo}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Processo</TableHead>
                    <TableHead>Objeto</TableHead>
                    <TableHead>Fornecedor(es)</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(processos[contratoSelecionado.id] || []).map((processo) => (
                    <TableRow key={processo.id}>
                      <TableCell className="font-medium">{processo.processo_numero}</TableCell>
                      <TableCell className="max-w-xs truncate" title={stripHtml(processo.objeto_processo)}>
                        {stripHtml(processo.objeto_processo).substring(0, 50)}...
                      </TableCell>
                      <TableCell>
                        {processo.fornecedores_vencedores?.map((f: FornecedorVencedor, i: number) => (
                          <div key={i} className="text-sm">
                            {f.razaoSocial}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        {processo.data_envio_contabilidade && formatarData(processo.data_envio_contabilidade)}
                      </TableCell>
                      <TableCell>
                        {processo.respondido_contabilidade ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Respondido
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <Clock className="h-3 w-3 mr-1" />
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => visualizarDocumento(processo.url_arquivo)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          {processo.respondido_contabilidade && processo.url_resposta_pdf ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => visualizarDocumento(processo.url_resposta_pdf!)}
                              >
                                <FileDown className="h-4 w-4 mr-1" />
                                Ver Resposta
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => abrirDialogExcluir(processo)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Excluir
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => abrirDialogResposta(processo)}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Responder
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de Resposta */}
      <Dialog open={dialogRespostaOpen} onOpenChange={setDialogRespostaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Responder Encaminhamento</DialogTitle>
            <DialogDescription>
              Processo: {processoSelecionado?.processo_numero}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Objeto:</h4>
              <p className="text-sm text-muted-foreground">
                {processoSelecionado && stripHtml(processoSelecionado.objeto_processo)}
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Tipo de Operação por Fornecedor:</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Informe o tipo de operação (números e letras maiúsculas) para cada fornecedor
              </p>
              
              {processoSelecionado?.fornecedores_vencedores?.map((f: FornecedorVencedor, i: number) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <div>
                    <p className="font-medium text-sm">{f.razaoSocial}</p>
                    <p className="text-xs text-muted-foreground">CNPJ: {formatarCNPJ(f.cnpj)}</p>
                  </div>
                  <div>
                    <Label htmlFor={`tipo-${f.cnpj}`}>Tipo de Operação</Label>
                    <Input
                      id={`tipo-${f.cnpj}`}
                      placeholder="Ex: 001.01"
                      value={tiposOperacao[f.cnpj] || ""}
                      onChange={(e) => handleTipoOperacaoChange(f.cnpj, e.target.value)}
                      className="mt-1 font-mono uppercase"
                      maxLength={20}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRespostaOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={salvarResposta} 
              disabled={salvando || !todosCamposPreenchidos()}
            >
              <Send className="h-4 w-4 mr-2" />
              {salvando ? "Gerando PDF..." : "Enviar Resposta e Gerar PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={dialogExcluirOpen} onOpenChange={setDialogExcluirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Você está prestes a excluir a resposta do processo <strong>{processoParaExcluir?.processo_numero}</strong>.
              </p>
              <p className="text-amber-600 font-medium">
                O processo voltará para a lista de pendentes e será necessário responder novamente.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirResposta}
              disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindo ? "Excluindo..." : "Confirmar Exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
