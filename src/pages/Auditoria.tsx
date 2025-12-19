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
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Shield, User, FileText, Trash2 } from "lucide-react";
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
      log.usuario_nome?.toLowerCase().includes(filtro.toLowerCase())
  );

  const getAcaoBadge = (acao: string) => {
    const acaoLower = acao.toLowerCase();
    if (acaoLower.includes("criar") || acaoLower.includes("insert")) {
      return <Badge variant="default">Criar</Badge>;
    }
    if (acaoLower.includes("editar") || acaoLower.includes("update")) {
      return <Badge variant="secondary">Editar</Badge>;
    }
    if (acaoLower.includes("excluir") || acaoLower.includes("delete")) {
      return <Badge variant="destructive">Excluir</Badge>;
    }
    return <Badge variant="outline">{acao}</Badge>;
  };

  const getEntidadeIcon = (entidade: string) => {
    const entidadeLower = entidade.toLowerCase();
    if (entidadeLower.includes("usuario") || entidadeLower.includes("profile")) {
      return <User className="h-4 w-4" />;
    }
    if (entidadeLower.includes("processo") || entidadeLower.includes("contrato")) {
      return <FileText className="h-4 w-4" />;
    }
    return <Shield className="h-4 w-4" />;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Log de Auditoria</CardTitle>
                <CardDescription>
                  Visualize todas as ações realizadas no sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar por ação, entidade ou usuário..."
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
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead>Entidade</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsFiltrados.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {new Date(log.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getEntidadeIcon(log.entidade)}
                            <span className="font-medium">{log.entidade}</span>
                          </div>
                        </TableCell>
                        <TableCell>{log.usuario_nome || "Sistema"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.usuario_tipo || "interno"}</Badge>
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
