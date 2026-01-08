import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, FileText, Plus, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AuditLog {
  id: string;
  acao: string;
  entidade: string;
  entidade_id?: string;
  usuario_id?: string;
  usuario_nome?: string;
  usuario_tipo?: string;
  detalhes?: any;
  created_at: string;
}

const Auditoria = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filtro, setFiltro] = useState("");
  const [logSelecionado, setLogSelecionado] = useState<AuditLog | null>(null);
  const [dialogDetalhesAberto, setDialogDetalhesAberto] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("compliance, superintendente_executivo")
      .eq("id", session.user.id)
      .single();

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gestor")
      .maybeSingle();

    const isGestor = !!roleData;
    const isCompliance = profile?.compliance === true;
    const isSuperintendenteExecutivo = profile?.superintendente_executivo === true;

    if (!isGestor && !isCompliance && !isSuperintendenteExecutivo) {
      toast({
        title: "Acesso negado",
        description: "Apenas gestores, compliance e superintendentes executivos podem acessar esta página.",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    loadLogs();
    setLoading(false);
  };

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar logs",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const logsFiltrados = logs.filter(
    (log) =>
      log.acao.toLowerCase().includes(filtro.toLowerCase()) ||
      log.entidade.toLowerCase().includes(filtro.toLowerCase()) ||
      log.usuario_nome?.toLowerCase().includes(filtro.toLowerCase()) ||
      log.detalhes?.nome_arquivo?.toLowerCase().includes(filtro.toLowerCase()) ||
      log.detalhes?.numero_processo?.toLowerCase().includes(filtro.toLowerCase())
  );

  const getAcaoBadge = (acao: string) => {
    const acaoLower = acao.toLowerCase();
    if (acaoLower.includes("criar") || acaoLower.includes("insert") || acaoLower.includes("criação")) {
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1">
          <Plus className="h-3 w-3" />
          Criação
        </Badge>
      );
    }
    if (acaoLower.includes("editar") || acaoLower.includes("update") || acaoLower.includes("atualização") || acaoLower.includes("edição")) {
      return (
        <Badge className="bg-blue-500 hover:bg-blue-600 text-white gap-1">
          <Edit className="h-3 w-3" />
          Edição
        </Badge>
      );
    }
    if (acaoLower.includes("excluir") || acaoLower.includes("delete") || acaoLower.includes("deleção") || acaoLower.includes("exclusão")) {
      return (
        <Badge className="bg-red-500 hover:bg-red-600 text-white gap-1">
          <Trash2 className="h-3 w-3" />
          Exclusão
        </Badge>
      );
    }
    return <Badge variant="outline">{acao}</Badge>;
  };

  const getNomeArquivo = (log: AuditLog) => {
    const detalhes = log.detalhes;
    if (!detalhes) return log.entidade;

    // Priorizar nome do documento formatado, depois nome do arquivo
    if (detalhes.nome_documento) return detalhes.nome_documento;
    if (detalhes.tipo) return detalhes.tipo;
    if (detalhes.nome_arquivo) return detalhes.nome_arquivo;
    
    return log.entidade;
  };

  const abrirDetalhes = (log: AuditLog) => {
    setLogSelecionado(log);
    setDialogDetalhesAberto(true);
  };

  const formatarDetalhe = (chave: string, valor: any): string => {
    if (valor === null || valor === undefined) return "N/A";
    if (typeof valor === "boolean") return valor ? "Sim" : "Não";
    if (typeof valor === "object") return JSON.stringify(valor, null, 2);
    return String(valor);
  };

  const traduzirChave = (chave: string): string => {
    const traducoes: Record<string, string> = {
      numero_processo: "Número do Processo",
      nome_arquivo: "Nome do Arquivo",
      nome_documento: "Tipo de Documento",
      tipo: "Categoria",
      objeto: "Objeto",
      titulo: "Título",
      titulo_cotacao: "Título da Cotação",
      fornecedor: "Fornecedor",
      selecao: "Seleção",
      protocolo: "Protocolo",
      tipo_autorizacao: "Tipo de Autorização",
      contrato_gestao: "Contrato de Gestão",
      numero_item: "Número do Item",
      numero_lote: "Número do Lote",
      descricao: "Descrição",
      descricao_lote: "Descrição do Lote",
      cotacao_id: "ID da Cotação",
      fornecedores_incluidos: "Fornecedores Incluídos",
      status: "Status",
      alteracoes: "Alterações Realizadas",
      campo_alterado: "Campo Alterado",
      valor_anterior: "Valor Anterior",
      valor_novo: "Novo Valor",
      nome_fonte: "Nome da Fonte",
      valor_total: "Valor Total",
      quantidade_itens: "Quantidade de Itens",
      cnpj: "CNPJ",
    };
    return traducoes[chave] || chave;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Log de Auditoria</CardTitle>
            <CardDescription>
              Visualize todas as ações realizadas no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar por ação, arquivo, processo ou usuário..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>

            {logsFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {logs.length === 0
                  ? "Nenhum registro de auditoria encontrado."
                  : "Nenhum log encontrado com os filtros aplicados."}
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Data/Hora</TableHead>
                      <TableHead className="w-[120px]">Ação</TableHead>
                      <TableHead>Arquivo/Documento</TableHead>
                      <TableHead>Processo</TableHead>
                      <TableHead>Contrato de Gestão</TableHead>
                      <TableHead className="w-[60px] text-center">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsFiltrados.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-mono">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate max-w-[300px]" title={getNomeArquivo(log)}>
                              {getNomeArquivo(log)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.detalhes?.numero_processo || "-"}
                        </TableCell>
                        <TableCell className="text-sm truncate max-w-[200px]" title={log.detalhes?.contrato_gestao || ""}>
                          {log.detalhes?.contrato_gestao || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirDetalhes(log)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Detalhes */}
      <Dialog open={dialogDetalhesAberto} onOpenChange={setDialogDetalhesAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalhes do Registro
            </DialogTitle>
            <DialogDescription>
              Informações completas sobre esta ação
            </DialogDescription>
          </DialogHeader>

          {logSelecionado && (
            <div className="space-y-4">
              {/* Informações básicas */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Data/Hora</p>
                  <p className="font-medium text-sm">
                    {new Date(logSelecionado.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ação</p>
                  <div className="mt-0.5">{getAcaoBadge(logSelecionado.acao)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Usuário</p>
                  <p className="font-medium text-sm">{logSelecionado.usuario_nome || "Sistema"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo de Usuário</p>
                  <p className="font-medium text-sm">{logSelecionado.usuario_tipo || "interno"}</p>
                </div>
              </div>

              {/* Detalhes do documento */}
              {logSelecionado.detalhes && Object.keys(logSelecionado.detalhes).length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Informações do Documento</h4>
                  <div className="border rounded-lg divide-y">
                    {Object.entries(logSelecionado.detalhes)
                      .filter(([chave]) => chave !== 'alteracoes')
                      .map(([chave, valor]) => (
                      <div key={chave} className="flex justify-between py-2 px-3">
                        <span className="text-sm text-muted-foreground">
                          {traduzirChave(chave)}
                        </span>
                        <span className="text-sm font-medium text-right max-w-[200px] truncate" title={formatarDetalhe(chave, valor)}>
                          {formatarDetalhe(chave, valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alterações realizadas (apenas para edições) */}
              {logSelecionado.detalhes?.alteracoes && 
               Array.isArray(logSelecionado.detalhes.alteracoes) && 
               logSelecionado.detalhes.alteracoes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-blue-600">Alterações Realizadas</h4>
                  <div className="border border-blue-200 rounded-lg divide-y bg-blue-50/50">
                    {logSelecionado.detalhes.alteracoes.map((alt: any, index: number) => (
                      <div key={index} className="py-2 px-3">
                        <p className="text-sm font-medium text-foreground">{alt.campo}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            {alt.de || "(vazio)"}
                          </span>
                          <span className="text-xs text-muted-foreground">→</span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            {alt.para || "(vazio)"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* IDs técnicos */}
              <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
                <p><span className="font-medium">ID do Log:</span> {logSelecionado.id}</p>
                {logSelecionado.entidade_id && (
                  <p><span className="font-medium">ID da Entidade:</span> {logSelecionado.entidade_id}</p>
                )}
                <p><span className="font-medium">Tabela:</span> {logSelecionado.entidade}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auditoria;
