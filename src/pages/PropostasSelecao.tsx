import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";

interface PropostaFornecedor {
  id: string;
  valor_total_proposta: number;
  observacoes_fornecedor: string | null;
  data_envio_proposta: string;
  desclassificado: boolean | null;
  motivo_desclassificacao: string | null;
  fornecedor: {
    razao_social: string;
    cnpj: string;
  };
}

export default function PropostasSelecao() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selecaoId = searchParams.get("selecao");
  
  const [propostas, setPropostas] = useState<PropostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);

  useEffect(() => {
    if (selecaoId) {
      loadPropostas();
    }
  }, [selecaoId]);

  const loadPropostas = async () => {
    try {
      setLoading(true);

      // Carregar seleção e processo
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Carregar propostas dos fornecedores
      const { data: propostasData, error: propostasError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          *,
          fornecedor:fornecedores(razao_social, cnpj)
        `)
        .eq("selecao_id", selecaoId)
        .order("data_envio_proposta", { ascending: false });

      if (propostasError) throw propostasError;

      setPropostas(propostasData || []);
    } catch (error) {
      console.error("Erro ao carregar propostas:", error);
      toast.error("Erro ao carregar propostas da seleção");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatCNPJ = (cnpj: string) => {
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando propostas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Logo */}
      <div className="flex justify-center mb-6">
        <img 
          src={logoHorizontal} 
          alt="Prima Qualitá" 
          className="h-16 object-contain"
        />
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => navigate(`/detalhe-selecao?id=${selecaoId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Propostas Recebidas</h1>
          <p className="text-muted-foreground">
            {selecao?.titulo_selecao} - Processo {processo?.numero_processo_interno}
          </p>
        </div>
      </div>

      {/* Informações da Seleção */}
      <Card>
        <CardHeader>
          <CardTitle>Informações da Seleção</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Data da Sessão</p>
            <p className="font-medium">
              {(() => {
                const date = new Date(selecao?.data_sessao_disputa + 'T00:00:00');
                const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
                return localDate.toLocaleDateString('pt-BR');
              })()} às {selecao?.hora_sessao_disputa}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Critério de Julgamento</p>
            <p className="font-medium capitalize">
              {processo?.criterio_julgamento?.replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={selecao?.status_selecao === 'encerrada' ? 'default' : 'secondary'}>
              {selecao?.status_selecao}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Propostas */}
      <Card>
        <CardHeader>
          <CardTitle>Propostas dos Fornecedores ({propostas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {propostas.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Nenhuma proposta recebida ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead>Data de Envio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propostas.map((proposta) => (
                  <TableRow key={proposta.id}>
                    <TableCell className="font-medium">
                      {proposta.fornecedor.razao_social}
                    </TableCell>
                    <TableCell>{formatCNPJ(proposta.fornecedor.cnpj)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(proposta.valor_total_proposta)}
                    </TableCell>
                    <TableCell>
                      {formatDateTime(proposta.data_envio_proposta)}
                    </TableCell>
                    <TableCell>
                      {proposta.desclassificado ? (
                        <Badge variant="destructive">Desclassificado</Badge>
                      ) : (
                        <Badge variant="default">Classificado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            toast.info("Visualização de proposta em desenvolvimento");
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalhes
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {propostas.some(p => p.motivo_desclassificacao) && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3">Motivos de Desclassificação</h3>
              <div className="space-y-2">
                {propostas
                  .filter(p => p.desclassificado && p.motivo_desclassificacao)
                  .map(p => (
                    <div key={p.id} className="p-3 bg-muted rounded-md">
                      <p className="font-medium">{p.fornecedor.razao_social}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {p.motivo_desclassificacao}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
