import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";

interface Contrato {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
  status: string;
}

interface Processo {
  id: string;
  numero_processo_interno: string;
  objeto_resumido: string;
  valor_estimado_anual: number;
  valor_planilha?: number;
  requer_selecao: boolean;
  criterio_julgamento?: string;
}

interface Selecao {
  id: string;
  processo_compra_id: string;
  titulo_selecao: string;
  status_selecao: string;
  data_sessao_disputa: string;
  hora_sessao_disputa: string;
  valor_estimado_anual: number;
  criterios_julgamento?: string;
}

const Selecoes = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoSelecionado, setContratoSelecionado] = useState<Contrato | null>(null);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null);
  const [selecoes, setSelecoes] = useState<Selecao[]>([]);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    checkAuth();
    loadContratos();
  }, []);

  useEffect(() => {
    if (contratoSelecionado) {
      loadProcessos(contratoSelecionado.id);
    }
  }, [contratoSelecionado]);

  useEffect(() => {
    if (processoSelecionado) {
      loadSelecoes(processoSelecionado.id);
    }
  }, [processoSelecionado]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    }
    setLoading(false);
  };

  const loadContratos = async () => {
    const { data, error } = await supabase
      .from("contratos_gestao")
      .select("*")
      .order("nome_contrato", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar contratos");
      console.error(error);
    } else {
      setContratos(data || []);
    }
  };

  const loadProcessos = async (contratoId: string) => {
    const { data, error } = await supabase
      .from("processos_compras")
      .select("*")
      .eq("contrato_gestao_id", contratoId)
      .eq("requer_selecao", true)
      .order("numero_processo_interno", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar processos");
      console.error(error);
      return;
    }

    // Para cada processo, buscar o valor da planilha consolidada mais recente
    const processosComValor = await Promise.all(
      (data || []).map(async (processo) => {
        // Buscar cotação do processo
        const { data: cotacao } = await supabase
          .from("cotacoes_precos")
          .select("id")
          .eq("processo_compra_id", processo.id)
          .single();

        if (!cotacao) {
          return { ...processo, valor_planilha: 0 };
        }

        // Buscar planilha consolidada mais recente
        const { data: planilha } = await supabase
          .from("planilhas_consolidadas")
          .select("fornecedores_incluidos")
          .eq("cotacao_id", cotacao.id)
          .order("data_geracao", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!planilha?.fornecedores_incluidos) {
          return { ...processo, valor_planilha: 0 };
        }

        // Calcular valor total da planilha
        let valorTotal = 0;
        if (Array.isArray(planilha.fornecedores_incluidos)) {
          planilha.fornecedores_incluidos.forEach((fornecedor: any) => {
            if (fornecedor.itens && Array.isArray(fornecedor.itens)) {
              fornecedor.itens.forEach((item: any) => {
                const valorItem = parseFloat(item.valor_total || 0);
                if (!isNaN(valorItem)) {
                  valorTotal += valorItem;
                }
              });
            }
          });
        }

        return { ...processo, valor_planilha: valorTotal };
      })
    );

    setProcessos(processosComValor);
  };

  const loadSelecoes = async (processoId: string) => {
    const { data, error } = await supabase
      .from("selecoes_fornecedores")
      .select("*")
      .eq("processo_compra_id", processoId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar seleções");
      console.error(error);
    } else {
      setSelecoes(data || []);
    }
  };

  const handleExcluirSelecao = async (selecaoId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta seleção?")) {
      return;
    }

    const { error } = await supabase
      .from("selecoes_fornecedores")
      .delete()
      .eq("id", selecaoId);

    if (error) {
      toast.error("Erro ao excluir seleção");
      console.error(error);
    } else {
      toast.success("Seleção excluída com sucesso");
      if (processoSelecionado) {
        loadSelecoes(processoSelecionado.id);
      }
    }
  };

  const contratosFiltrados = contratos.filter(c =>
    c.nome_contrato.toLowerCase().includes(filtro.toLowerCase()) ||
    c.ente_federativo.toLowerCase().includes(filtro.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Lista de Contratos */}
        {!contratoSelecionado && (
          <Card>
            <CardHeader>
              <CardTitle>Contratos de Gestão</CardTitle>
              <CardDescription>
                Selecione um contrato para visualizar os processos que requerem seleção de fornecedores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Buscar contrato..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Contrato</TableHead>
                    <TableHead>Ente Federativo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhum contrato encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    contratosFiltrados.map((contrato) => (
                      <TableRow key={contrato.id}>
                        <TableCell className="font-medium">{contrato.nome_contrato}</TableCell>
                        <TableCell>{contrato.ente_federativo}</TableCell>
                        <TableCell>
                          <Badge variant={contrato.status === "ativo" ? "default" : "secondary"}>
                            {contrato.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setContratoSelecionado(contrato)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Ver Processos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Lista de Processos */}
        {contratoSelecionado && !processoSelecionado && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processos que Requerem Seleção de Fornecedores</CardTitle>
                  <CardDescription>
                    Contrato: {contratoSelecionado.nome_contrato}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setContratoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Processo</TableHead>
                    <TableHead>Objeto</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhum processo que requer seleção de fornecedores encontrado neste contrato
                      </TableCell>
                    </TableRow>
                  ) : (
                    processos.map((processo) => (
                      <TableRow key={processo.id}>
                        <TableCell className="font-medium">{processo.numero_processo_interno}</TableCell>
                        <TableCell dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processo.objeto_resumido) }} />
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setProcessoSelecionado(processo)}
                          >
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Ver Seleções
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Lista de Seleções */}
        {processoSelecionado && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Seleções de Fornecedores</CardTitle>
                  <CardDescription>
                    Processo: {processoSelecionado.numero_processo_interno}
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={() => setProcessoSelecionado(null)}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data/Hora Disputa</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selecoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Nenhuma seleção criada para este processo
                      </TableCell>
                    </TableRow>
                  ) : (
                    selecoes.map((selecao) => (
                      <TableRow key={selecao.id}>
                        <TableCell className="font-medium">{selecao.titulo_selecao}</TableCell>
                        <TableCell>
                          <Badge variant={selecao.status_selecao === "planejada" ? "default" : "secondary"}>
                            {selecao.status_selecao}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {selecao.data_sessao_disputa.split('T')[0].split('-').reverse().join('/')} às {selecao.hora_sessao_disputa}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => navigate(`/detalhe-selecao?id=${selecao.id}`)}
                            >
                              <ChevronRight className="h-4 w-4 mr-2" />
                              Ver Seleção
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExcluirSelecao(selecao.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Selecoes;
