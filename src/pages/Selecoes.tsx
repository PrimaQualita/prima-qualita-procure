import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";

interface Processo {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
}

interface Selecao {
  id: string;
  processo_compra_id: string;
  titulo_selecao: string;
  status_selecao: string;
  data_sessao_disputa: string;
  hora_sessao_disputa: string;
  valor_estimado_anual: number;
  processos_compras?: Processo;
}

const Selecoes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selecoes, setSelecoes] = useState<Selecao[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    checkAuth();
    loadSelecoes();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
    setLoading(false);
  };

  const loadSelecoes = async () => {
    const { data, error } = await supabase
      .from("selecoes_fornecedores")
      .select(`
        *,
        processos_compras (
          id,
          numero_processo_interno,
          objeto_resumido
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar seleções");
      console.error(error);
    } else {
      setSelecoes(data || []);
    }
  };

  const selecoesFiltradas = selecoes.filter(s =>
    s.titulo_selecao.toLowerCase().includes(filtro.toLowerCase()) ||
    s.processos_compras?.numero_processo_interno.toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Gestão de Contratos e Processos</h1>
              <p className="text-sm text-muted-foreground">Seleção de Fornecedores</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Seleção de Fornecedores</CardTitle>
            <CardDescription>
              Gerencie processos de seleção e disputa de fornecedores
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Input
                placeholder="Buscar seleção..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Processo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data/Hora Disputa</TableHead>
                  <TableHead className="text-right">Valor Estimado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selecoesFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhuma seleção encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  selecoesFiltradas.map((selecao) => (
                    <TableRow key={selecao.id}>
                      <TableCell>{selecao.processos_compras?.numero_processo_interno}</TableCell>
                      <TableCell>{selecao.titulo_selecao}</TableCell>
                      <TableCell>
                        <Badge variant={selecao.status_selecao === "planejada" ? "default" : "secondary"}>
                          {selecao.status_selecao}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(selecao.data_sessao_disputa).toLocaleDateString("pt-BR")} às {selecao.hora_sessao_disputa}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {selecao.valor_estimado_anual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Selecoes;
