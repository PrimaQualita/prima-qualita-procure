import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileText, Eye, ChevronRight, ArrowLeft, CheckCircle, Clock, MessageSquare, Send, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { stripHtml } from "@/lib/htmlUtils";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface ProcessoContabilidade {
  id: string;
  cotacao_id: string;
  processo_numero: string;
  objeto_processo: string;
  fornecedores_vencedores: any[];
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
  const [respostaTexto, setRespostaTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

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
    setRespostaTexto(processo.resposta_contabilidade || "");
    setDialogRespostaOpen(true);
  };

  const salvarResposta = async () => {
    if (!processoSelecionado || !respostaTexto.trim()) {
      toast.error("Digite uma resposta");
      return;
    }

    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("encaminhamentos_contabilidade")
        .update({
          respondido_contabilidade: true,
          data_resposta_contabilidade: new Date().toISOString(),
          resposta_contabilidade: respostaTexto.trim(),
          usuario_resposta_id: userData?.user?.id
        })
        .eq("id", processoSelecionado.id);

      if (error) throw error;

      toast.success("Resposta salva com sucesso!");
      setDialogRespostaOpen(false);
      setProcessoSelecionado(null);
      setRespostaTexto("");
      loadData();
    } catch (error: any) {
      console.error("Erro ao salvar resposta:", error);
      toast.error("Erro ao salvar resposta");
    } finally {
      setSalvando(false);
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
                        {processo.fornecedores_vencedores?.map((f: any, i: number) => (
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
                          <Button
                            variant={processo.respondido_contabilidade ? "outline" : "default"}
                            size="sm"
                            onClick={() => abrirDialogResposta(processo)}
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            {processo.respondido_contabilidade ? "Ver Resposta" : "Responder"}
                          </Button>
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
            <DialogTitle>
              {processoSelecionado?.respondido_contabilidade ? "Resposta da Contabilidade" : "Responder Encaminhamento"}
            </DialogTitle>
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

            <div>
              <h4 className="font-medium mb-2">Fornecedor(es):</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {processoSelecionado?.fornecedores_vencedores?.map((f: any, i: number) => (
                  <li key={i}>{f.razaoSocial} - CNPJ: {f.cnpj}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">Tipo de Operação / Resposta:</h4>
              <Textarea
                value={respostaTexto}
                onChange={(e) => setRespostaTexto(e.target.value)}
                placeholder="Digite o tipo de operação que deve ser utilizada no CIGAM..."
                rows={4}
                disabled={processoSelecionado?.respondido_contabilidade}
              />
            </div>

            {processoSelecionado?.respondido_contabilidade && processoSelecionado?.data_resposta_contabilidade && (
              <p className="text-sm text-muted-foreground">
                Respondido em: {formatarData(processoSelecionado.data_resposta_contabilidade)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRespostaOpen(false)}>
              Fechar
            </Button>
            {!processoSelecionado?.respondido_contabilidade && (
              <Button onClick={salvarResposta} disabled={salvando || !respostaTexto.trim()}>
                <Send className="h-4 w-4 mr-2" />
                {salvando ? "Salvando..." : "Enviar Resposta"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}