import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, Save, Eye, Gavel } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Item {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_ofertado: number;
  marca_ofertada?: string;
  marca?: string;
}

const SistemaLancesFornecedor = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const propostaId = searchParams.get("proposta");

  const [loading, setLoading] = useState(true);
  const [proposta, setProposta] = useState<any>(null);
  const [selecao, setSelecao] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [editavel, setEditavel] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (propostaId) {
      loadProposta();
    }
  }, [propostaId]);

  const loadProposta = async () => {
    try {
      // Carregar proposta com fornecedor e seleção
      const { data: propostaData, error: propostaError } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          *,
          fornecedores(*),
          selecoes_fornecedores(*)
        `)
        .eq("id", propostaId)
        .single();

      if (propostaError) throw propostaError;
      
      setProposta(propostaData);
      setSelecao(propostaData.selecoes_fornecedores);

      // Verificar se ainda é editável (5 minutos antes da sessão)
      const dataHoraSelecao = new Date(`${propostaData.selecoes_fornecedores.data_sessao_disputa}T${propostaData.selecoes_fornecedores.hora_sessao_disputa}`);
      const cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);
      const agora = new Date();
      
      setEditavel(agora < cincoMinutosAntes);

      // Carregar itens da proposta
      const { data: itensData, error: itensError } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .select("*")
        .eq("proposta_id", propostaId)
        .order("numero_item");

      if (itensError) throw itensError;
      
      // Mapear os dados para o formato correto
      const itensMapeados = (itensData || []).map(item => ({
        ...item,
        marca_ofertada: item.marca || ""
      }));
      
      setItens(itensMapeados);

    } catch (error) {
      console.error("Erro ao carregar proposta:", error);
      toast.error("Erro ao carregar proposta");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = (itemId: string, field: string, value: any) => {
    setItens(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleSalvar = async () => {
    if (!editavel) {
      toast.error("O prazo para edição já expirou");
      return;
    }

    setSalvando(true);
    try {
      // Atualizar cada item
      for (const item of itens) {
        const { error } = await supabase
          .from("selecao_respostas_itens_fornecedor")
          .update({
            valor_unitario_ofertado: item.valor_unitario_ofertado,
            marca_ofertada: item.marca_ofertada,
            valor_total_item: item.valor_unitario_ofertado * item.quantidade
          })
          .eq("id", item.id);

        if (error) throw error;
      }

      // Recalcular valor total da proposta
      const valorTotal = itens.reduce((acc, item) => acc + (item.valor_unitario_ofertado * item.quantidade), 0);
      
      const { error: propostaError } = await supabase
        .from("selecao_propostas_fornecedor")
        .update({ valor_total_proposta: valorTotal })
        .eq("id", propostaId);

      if (propostaError) throw propostaError;

      toast.success("Proposta atualizada com sucesso!");
      await loadProposta();

    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar alterações");
    } finally {
      setSalvando(false);
    }
  };

  const formatarMoeda = (valor: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(valor);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!proposta || !selecao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Proposta não encontrada</CardTitle>
            <CardDescription>A proposta solicitada não existe ou você não tem acesso.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dataHoraSelecao = new Date(`${selecao.data_sessao_disputa}T${selecao.hora_sessao_disputa}`);
  const cincoMinutosAntes = new Date(dataHoraSelecao.getTime() - 5 * 60 * 1000);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        {/* Informações da Seleção */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              {selecao.titulo_selecao}
            </CardTitle>
            <CardDescription>
              Sessão de Disputa: {format(dataHoraSelecao, "dd/MM/yyyy 'às' HH:mm")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">Código de Acesso</Label>
                <p className="font-mono font-bold text-lg">{proposta.codigo_acesso}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Fornecedor</Label>
                <p className="font-semibold">{proposta.fornecedores.razao_social}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Status de Edição</Label>
                <div className="flex items-center gap-2">
                  {editavel ? (
                    <Badge variant="default" className="bg-green-500">
                      <Eye className="h-3 w-3 mr-1" />
                      Editável até {format(cincoMinutosAntes, "dd/MM/yyyy HH:mm")}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <Lock className="h-3 w-3 mr-1" />
                      Bloqueado para edição
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Itens */}
        <Card>
          <CardHeader>
            <CardTitle>Itens da Proposta</CardTitle>
            <CardDescription>
              {editavel 
                ? "Você pode editar os valores e marcas até 5 minutos antes da sessão de disputa"
                : "O prazo para edição expirou. Os valores abaixo são apenas para consulta."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Item</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Qtd</TableHead>
                    <TableHead className="w-24">Unidade</TableHead>
                    <TableHead className="w-40">Marca</TableHead>
                    <TableHead className="w-40">Valor Unitário</TableHead>
                    <TableHead className="w-40">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.numero_item}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell>{item.quantidade}</TableCell>
                      <TableCell>{item.unidade}</TableCell>
                      <TableCell>
                        <Input
                          value={item.marca_ofertada || ""}
                          onChange={(e) => handleUpdateItem(item.id, "marca_ofertada", e.target.value)}
                          disabled={!editavel}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.valor_unitario_ofertado || ""}
                          onChange={(e) => handleUpdateItem(item.id, "valor_unitario_ofertado", parseFloat(e.target.value) || 0)}
                          disabled={!editavel}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatarMoeda(item.valor_unitario_ofertado * item.quantidade)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <div>
                <Label className="text-sm text-muted-foreground">Valor Total da Proposta</Label>
                <p className="text-2xl font-bold text-primary">
                  {formatarMoeda(itens.reduce((acc, item) => acc + (item.valor_unitario_ofertado * item.quantidade), 0))}
                </p>
              </div>
              
              {editavel && (
                <Button 
                  onClick={handleSalvar} 
                  disabled={salvando}
                  size="lg"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? "Salvando..." : "Salvar Alterações"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SistemaLancesFornecedor;
