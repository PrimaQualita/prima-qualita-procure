import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, User, FileText, Building, FileCheck, ScrollText, ClipboardList, Truck, RefreshCw, Download } from "lucide-react";
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
  const [filtroAcao, setFiltroAcao] = useState<string>("todas");
  const [filtroEntidade, setFiltroEntidade] = useState<string>("todas");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Verificar se é gestor ou compliance
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
        .limit(1000);

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

  const logsFiltrados = logs.filter((log) => {
    const matchTexto =
      log.acao.toLowerCase().includes(filtro.toLowerCase()) ||
      log.entidade.toLowerCase().includes(filtro.toLowerCase()) ||
      log.usuario_nome?.toLowerCase().includes(filtro.toLowerCase()) ||
      (log.detalhes && JSON.stringify(log.detalhes).toLowerCase().includes(filtro.toLowerCase()));

    const matchAcao = filtroAcao === "todas" || log.acao === filtroAcao;
    const matchEntidade = filtroEntidade === "todas" || log.entidade === filtroEntidade;

    return matchTexto && matchAcao && matchEntidade;
  });

  // Obter lista única de entidades para o filtro
  const entidadesUnicas = [...new Set(logs.map(log => log.entidade))].sort();

  const getAcaoBadge = (acao: string) => {
    switch (acao) {
      case "criar":
        return <Badge className="bg-green-500 hover:bg-green-600">Criar</Badge>;
      case "editar":
        return <Badge className="bg-blue-500 hover:bg-blue-600">Editar</Badge>;
      case "excluir":
        return <Badge variant="destructive">Excluir</Badge>;
      case "enviar":
        return <Badge className="bg-purple-500 hover:bg-purple-600">Enviar</Badge>;
      case "receber":
        return <Badge className="bg-cyan-500 hover:bg-cyan-600">Receber</Badge>;
      case "aprovar":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600">Aprovar</Badge>;
      case "rejeitar":
        return <Badge className="bg-orange-500 hover:bg-orange-600">Rejeitar</Badge>;
      default:
        return <Badge variant="outline">{acao}</Badge>;
    }
  };

  const getEntidadeIcon = (entidade: string) => {
    const entidadeLower = entidade.toLowerCase();
    if (entidadeLower.includes("usuário") || entidadeLower.includes("profile")) {
      return <User className="h-4 w-4" />;
    }
    if (entidadeLower.includes("processo")) {
      return <FileText className="h-4 w-4" />;
    }
    if (entidadeLower.includes("contrato")) {
      return <Building className="h-4 w-4" />;
    }
    if (entidadeLower.includes("ata") || entidadeLower.includes("homologação")) {
      return <FileCheck className="h-4 w-4" />;
    }
    if (entidadeLower.includes("seleção") || entidadeLower.includes("cotação")) {
      return <ClipboardList className="h-4 w-4" />;
    }
    if (entidadeLower.includes("proposta") || entidadeLower.includes("fornecedor")) {
      return <Truck className="h-4 w-4" />;
    }
    if (entidadeLower.includes("relatório") || entidadeLower.includes("planilha")) {
      return <ScrollText className="h-4 w-4" />;
    }
    return <Shield className="h-4 w-4" />;
  };

  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case "interno":
        return <Badge variant="secondary">Interno</Badge>;
      case "fornecedor":
        return <Badge className="bg-amber-500 hover:bg-amber-600">Fornecedor</Badge>;
      case "externo":
        return <Badge variant="outline">Externo</Badge>;
      case "sistema":
        return <Badge variant="outline">Sistema</Badge>;
      default:
        return <Badge variant="outline">{tipo || "interno"}</Badge>;
    }
  };

  const formatarDetalhes = (detalhes: any): string => {
    if (!detalhes) return "-";
    
    const partes: string[] = [];
    
    if (detalhes.numero) partes.push(`Nº: ${detalhes.numero}`);
    if (detalhes.protocolo) partes.push(`Protocolo: ${detalhes.protocolo}`);
    if (detalhes.titulo) partes.push(`Título: ${detalhes.titulo}`);
    if (detalhes.nome) partes.push(`Nome: ${detalhes.nome}`);
    if (detalhes.razao_social) partes.push(`Razão Social: ${detalhes.razao_social}`);
    if (detalhes.cnpj) partes.push(`CNPJ: ${detalhes.cnpj}`);
    if (detalhes.objeto) partes.push(`Objeto: ${detalhes.objeto.substring(0, 50)}...`);
    if (detalhes.nome_arquivo) partes.push(`Arquivo: ${detalhes.nome_arquivo}`);
    if (detalhes.tipo) partes.push(`Tipo: ${detalhes.tipo}`);
    if (detalhes.processo_numero) partes.push(`Processo: ${detalhes.processo_numero}`);
    if (detalhes.ente) partes.push(`Ente: ${detalhes.ente}`);
    if (detalhes.email) partes.push(`Email: ${detalhes.email}`);
    
    return partes.length > 0 ? partes.join(" | ") : "-";
  };

  const exportarCSV = () => {
    const headers = ["Data/Hora", "Ação", "Entidade", "Usuário", "Tipo", "Detalhes"];
    const rows = logsFiltrados.map(log => [
      new Date(log.created_at).toLocaleString("pt-BR"),
      log.acao,
      log.entidade,
      log.usuario_nome || "Sistema",
      log.usuario_tipo || "interno",
      formatarDetalhes(log.detalhes)
    ]);

    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-auditoria-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle>Log de Auditoria</CardTitle>
                <CardDescription>
                  Visualize todas as ações realizadas no sistema ({logs.length} registros)
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadLogs}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar
                </Button>
                <Button variant="outline" size="sm" onClick={exportarCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="Buscar por ação, entidade, usuário ou detalhes..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                />
              </div>
              <Select value={filtroAcao} onValueChange={setFiltroAcao}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas ações</SelectItem>
                  <SelectItem value="criar">Criar</SelectItem>
                  <SelectItem value="editar">Editar</SelectItem>
                  <SelectItem value="excluir">Excluir</SelectItem>
                  <SelectItem value="enviar">Enviar</SelectItem>
                  <SelectItem value="receber">Receber</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroEntidade} onValueChange={setFiltroEntidade}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas entidades</SelectItem>
                  {entidadesUnicas.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {logsFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {logs.length === 0
                  ? "Nenhum registro de auditoria encontrado. As próximas ações no sistema serão registradas automaticamente."
                  : "Nenhum log encontrado com os filtros aplicados."}
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Data/Hora</TableHead>
                      <TableHead className="w-24">Ação</TableHead>
                      <TableHead className="w-48">Entidade</TableHead>
                      <TableHead className="w-40">Usuário</TableHead>
                      <TableHead className="w-28">Tipo</TableHead>
                      <TableHead>Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsFiltrados.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                          })}
                        </TableCell>
                        <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getEntidadeIcon(log.entidade)}
                            <span className="font-medium text-sm">{log.entidade}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{log.usuario_nome || "Sistema"}</TableCell>
                        <TableCell>{getTipoBadge(log.usuario_tipo || "interno")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                          {formatarDetalhes(log.detalhes)}
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
    </div>
  );
};

export default Auditoria;
