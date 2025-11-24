import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, FileText, Gavel, Send } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import primaLogo from "@/assets/prima-qualita-logo-horizontal.png";
import { z } from "zod";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

// Validação CNPJ
const validarCNPJ = (cnpj: string): boolean => {
  const cnpjLimpo = cnpj.replace(/[^\d]/g, "");
  if (cnpjLimpo.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpjLimpo)) return false;
  
  let tamanho = cnpjLimpo.length - 2;
  let numeros = cnpjLimpo.substring(0, tamanho);
  const digitos = cnpjLimpo.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;
  
  tamanho = tamanho + 1;
  numeros = cnpjLimpo.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  
  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos.charAt(1));
};

const formatarCNPJ = (valor: string): string => {
  const apenasNumeros = valor.replace(/[^\d]/g, "");
  if (apenasNumeros.length <= 2) return apenasNumeros;
  if (apenasNumeros.length <= 5) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2)}`;
  if (apenasNumeros.length <= 8) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5)}`;
  if (apenasNumeros.length <= 12) return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8)}`;
  return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8, 12)}-${apenasNumeros.slice(12, 14)}`;
};

const dadosEmpresaSchema = z.object({
  razao_social: z.string().trim().min(1, "Razão Social é obrigatória").max(255),
  cnpj: z.string().trim().min(1, "CNPJ é obrigatório").refine((val) => validarCNPJ(val), { message: "CNPJ inválido" }),
  logradouro: z.string().trim().min(1, "Logradouro é obrigatório").max(255),
  numero: z.string().trim().min(1, "Número é obrigatório").max(20),
  bairro: z.string().trim().min(1, "Bairro é obrigatório").max(100),
  municipio: z.string().trim().min(1, "Município é obrigatório").max(100),
  uf: z.string().length(2, "UF inválida"),
  cep: z.string().trim().min(8, "CEP inválido").max(9),
});

interface Item {
  id: string;
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca?: string;
  valor_unitario_estimado: number;
  valor_total: number;
  lote_id?: string | null;
}

interface Lote {
  id: string;
  numero_lote: number;
  descricao_lote: string;
}

interface RespostaItem {
  [key: string]: {
    valor_unitario_ofertado: number;
    marca_ofertada: string;
    valor_display?: string;
  };
}

const ParticiparSelecao = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selecaoId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selecao, setSelecao] = useState<any>(null);
  const [processo, setProcesso] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [avisoAnexado, setAvisoAnexado] = useState<any>(null);
  const [editalAnexado, setEditalAnexado] = useState<any>(null);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [jaEnviouProposta, setJaEnviouProposta] = useState(false);
  
  const [dadosEmpresa, setDadosEmpresa] = useState({
    razao_social: "",
    cnpj: "",
    logradouro: "",
    numero: "",
    bairro: "",
    municipio: "",
    uf: "",
    cep: "",
  });
  
  const [respostas, setRespostas] = useState<RespostaItem>({});
  const [observacoes, setObservacoes] = useState("");
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (selecaoId) {
      checkAuth();
    }
  }, [selecaoId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Buscar fornecedor associado ao usuário
      const { data: fornecedorData } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (fornecedorData) {
        setFornecedor(fornecedorData);
        setDadosEmpresa({
          razao_social: fornecedorData.razao_social || "",
          cnpj: formatarCNPJ(fornecedorData.cnpj) || "",
          logradouro: "",
          numero: "",
          bairro: "",
          municipio: "",
          uf: "",
          cep: "",
        });
        await loadSelecao(fornecedorData.id);
        return;
      }
    }
    
    // Se não autenticado ou sem fornecedor, carrega seleção como visitante
    await loadSelecao(null);
  };

  const loadSelecao = async (fornecedorId: string | null) => {
    try {
      // Carregar seleção
      const { data: selecaoData, error: selecaoError } = await supabase
        .from("selecoes_fornecedores")
        .select("*, processos_compras(*)")
        .eq("id", selecaoId)
        .single();

      if (selecaoError) throw selecaoError;
      
      setSelecao(selecaoData);
      setProcesso(selecaoData.processos_compras);

      // Se fornecedor autenticado, verificar se já enviou proposta
      if (fornecedorId) {
        const { data: propostaExistente } = await supabase
          .from("selecao_propostas_fornecedor")
          .select("*")
          .eq("selecao_id", selecaoId)
          .eq("fornecedor_id", fornecedorId)
          .maybeSingle();
        
        setJaEnviouProposta(!!propostaExistente);
      }

      // Carregar lotes se for por lote
      if (selecaoData.processos_compras?.criterio_julgamento === 'por_lote' && selecaoData.cotacao_relacionada_id) {
        const { data: lotesData } = await supabase
          .from("lotes_cotacao")
          .select("*")
          .eq("cotacao_id", selecaoData.cotacao_relacionada_id)
          .order("numero_lote", { ascending: true });
        setLotes(lotesData || []);
      }

      // Carregar itens
      if (selecaoData.cotacao_relacionada_id) {
        await loadItensFromPlanilha(selecaoData.cotacao_relacionada_id, selecaoData.created_at);
      }

      // Carregar documentos
      await loadDocumentosAnexados();

    } catch (error) {
      console.error("Erro ao carregar seleção:", error);
      toast.error("Erro ao carregar detalhes da seleção");
    } finally {
      setLoading(false);
    }
  };

  const loadItensFromPlanilha = async (cotacaoId: string, dataCriacaoSelecao: string) => {
    try {
      const [planilhaResult, itensOriginaisResult] = await Promise.all([
        supabase
          .from("planilhas_consolidadas")
          .select("fornecedores_incluidos, data_geracao")
          .eq("cotacao_id", cotacaoId)
          .lte("data_geracao", dataCriacaoSelecao)
          .order("data_geracao", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("itens_cotacao")
          .select("*")
          .eq("cotacao_id", cotacaoId)
          .order("numero_item", { ascending: true })
      ]);

      const { data: planilha } = planilhaResult;
      const { data: itensOriginais } = itensOriginaisResult;

      if (!planilha || !itensOriginais || itensOriginais.length === 0) {
        return;
      }

      const fornecedoresArray = planilha.fornecedores_incluidos as any[];
      const menoresValoresPorItem = new Map<number, number>();

      fornecedoresArray.forEach((fornecedor: any) => {
        if (fornecedor.itens) {
          fornecedor.itens.forEach((item: any) => {
            const valorAtual = menoresValoresPorItem.get(item.numero_item);
            const valorItem = item.valor_unitario || 0;
            
            if (!valorAtual || valorItem < valorAtual) {
              menoresValoresPorItem.set(item.numero_item, valorItem);
            }
          });
        }
      });

      const todosItens: Item[] = [];

      itensOriginais.forEach((itemOriginal) => {
        const valorEstimado = menoresValoresPorItem.get(itemOriginal.numero_item) || 0;
        const valorTotalItem = valorEstimado * itemOriginal.quantidade;
        
        todosItens.push({
          id: itemOriginal.id,
          numero_item: itemOriginal.numero_item,
          descricao: itemOriginal.descricao,
          quantidade: itemOriginal.quantidade,
          unidade: itemOriginal.unidade,
          marca: itemOriginal.marca,
          valor_unitario_estimado: valorEstimado,
          valor_total: valorTotalItem,
          lote_id: itemOriginal.lote_id
        });
      });

      setItens(todosItens);
      
      // Inicializar respostas
      const respostasIniciais: RespostaItem = {};
      todosItens.forEach((item) => {
        respostasIniciais[item.id] = {
          valor_unitario_ofertado: 0,
          valor_display: "",
          marca_ofertada: "",
        };
      });
      setRespostas(respostasIniciais);
    } catch (error) {
      console.error("Erro ao carregar itens:", error);
    }
  };

  const loadDocumentosAnexados = async () => {
    try {
      const { data, error } = await supabase
        .from("anexos_selecao")
        .select("*")
        .eq("selecao_id", selecaoId);

      if (error) throw error;

      if (data) {
        const aviso = data.find(d => d.tipo_documento === "aviso");
        const edital = data.find(d => d.tipo_documento === "edital");
        
        setAvisoAnexado(aviso);
        setEditalAnexado(edital);
      }
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
    }
  };

  const handleValorChange = (itemId: string, value: string) => {
    const valorNumerico = value.replace(/[^\d,]/g, '').replace(',', '.');
    const valorFormatado = value.replace(/[^\d,]/g, '');
    
    setRespostas(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        valor_unitario_ofertado: valorNumerico ? parseFloat(valorNumerico) : 0,
        valor_display: valorFormatado
      }
    }));
  };

  const handleMarcaChange = (itemId: string, marca: string) => {
    setRespostas(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        marca_ofertada: marca
      }
    }));
  };

  const calcularValorTotal = () => {
    return itens.reduce((total, item) => {
      const resposta = respostas[item.id];
      const valorUnitario = resposta?.valor_unitario_ofertado || 0;
      return total + (valorUnitario * item.quantidade);
    }, 0);
  };

  const handleSubmit = async () => {
    if (!fornecedor && !dadosEmpresa.cnpj) {
      toast.error("É necessário informar o CNPJ da empresa");
      return;
    }

    setSubmitting(true);
    try {
      // Validar dados da empresa se não autenticado
      if (!fornecedor) {
        try {
          dadosEmpresaSchema.parse(dadosEmpresa);
          setErrors({});
        } catch (error: any) {
          const fieldErrors: { [key: string]: string } = {};
          error.errors.forEach((err: any) => {
            fieldErrors[err.path[0]] = err.message;
          });
          setErrors(fieldErrors);
          toast.error("Por favor, preencha todos os campos corretamente");
          setSubmitting(false);
          return;
        }
      }

      // Validar valores
      const itensIncompletos = itens.filter(item => {
        const resposta = respostas[item.id];
        return !resposta?.valor_unitario_ofertado || resposta.valor_unitario_ofertado <= 0;
      });

      if (itensIncompletos.length > 0) {
        toast.error("Por favor, preencha os valores de todos os itens");
        setSubmitting(false);
        return;
      }

      const valorTotal = calcularValorTotal();
      const enderecoCompleto = fornecedor?.endereco_comercial || 
        `${dadosEmpresa.logradouro}, Nº ${dadosEmpresa.numero}, ${dadosEmpresa.bairro}, ${dadosEmpresa.municipio}/${dadosEmpresa.uf}, CEP: ${dadosEmpresa.cep}`;
      
      const cnpjLimpo = (fornecedor?.cnpj || dadosEmpresa.cnpj).replace(/[^\d]/g, "");
      
      let fornecedorId: string;
      
      if (fornecedor) {
        fornecedorId = fornecedor.id;
      } else {
        // Buscar ou criar fornecedor
        const { data: fornecedorBuscado } = await supabase
          .from("fornecedores")
          .select("id")
          .eq("cnpj", cnpjLimpo)
          .limit(1)
          .maybeSingle();

        if (fornecedorBuscado) {
          fornecedorId = fornecedorBuscado.id;
        } else {
          const { data: fornecedorCriado, error: erroCreate } = await supabase
            .from("fornecedores")
            .insert({
              razao_social: dadosEmpresa.razao_social,
              cnpj: cnpjLimpo,
              email: `selecao-${cnpjLimpo}@temporario.com`,
              telefone: "00000000000",
              endereco_comercial: enderecoCompleto,
              status_aprovacao: "pendente",
              ativo: false,
            })
            .select("id")
            .single();

          if (erroCreate) throw erroCreate;
          fornecedorId = fornecedorCriado.id;
        }
      }

      // Criar proposta
      const { data: propostaCriada, error: erroProposta } = await supabase
        .from("selecao_propostas_fornecedor")
        .insert({
          selecao_id: selecaoId,
          fornecedor_id: fornecedorId,
          observacoes_fornecedor: observacoes || null,
          valor_total_proposta: valorTotal,
          data_envio_proposta: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (erroProposta) throw erroProposta;

      // Criar respostas dos itens
      const itensParaInserir = itens.map(item => ({
        proposta_id: propostaCriada.id,
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        marca: respostas[item.id]?.marca_ofertada || null,
        valor_unitario_ofertado: respostas[item.id]?.valor_unitario_ofertado || 0,
        valor_total_item: (respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade,
      }));

      const { error: erroItens } = await supabase
        .from("selecao_respostas_itens_fornecedor")
        .insert(itensParaInserir);

      if (erroItens) throw erroItens;

      toast.success("Proposta enviada com sucesso! Aguarde a data da sessão de disputa para enviar lances.");
      setJaEnviouProposta(true);
      
    } catch (error) {
      console.error("Erro ao enviar proposta:", error);
      toast.error("Erro ao enviar proposta");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src={primaLogo} alt="Prima Qualitá" className="w-64 mx-auto mb-6" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!selecao) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src={primaLogo} alt="Prima Qualitá" className="w-64 mx-auto mb-6" />
          <h2 className="text-2xl font-bold mb-4">Seleção não encontrada</h2>
          <Button onClick={() => navigate("/portal-fornecedor")}>
            Voltar para Portal do Fornecedor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <img src={primaLogo} alt="Prima Qualitá" className="w-64 mx-auto mb-4" />
          <h1 className="text-3xl font-bold">{selecao.titulo_selecao}</h1>
          <p className="text-muted-foreground mt-2">
            Processo: {processo?.numero_processo_interno}
          </p>
        </div>

        {/* Informações da Seleção */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Informações da Seleção</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={selecao.status_selecao === "em_disputa" ? "default" : "secondary"}>
                  {selecao.status_selecao}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data da Sessão</p>
                <p className="font-medium">
                  {selecao.data_sessao_disputa.split('T')[0].split('-').reverse().join('/')} às {selecao.hora_sessao_disputa}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Critério de Julgamento</p>
                <p className="font-medium">{selecao.criterios_julgamento || processo?.criterio_julgamento}</p>
              </div>
            </div>
            {selecao.descricao && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Descrição</p>
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selecao.descricao) }} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Documentos da Seleção</CardTitle>
            <CardDescription>Leia atentamente antes de participar da disputa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {avisoAnexado && (
                <Button
                  variant="outline"
                  onClick={() => window.open(avisoAnexado.url_arquivo, '_blank')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Aviso de Seleção
                </Button>
              )}
              {editalAnexado && (
                <Button
                  variant="outline"
                  onClick={() => window.open(editalAnexado.url_arquivo, '_blank')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Edital
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Registro de Proposta */}
        {!jaEnviouProposta ? (
          <>
            {/* Dados da Empresa */}
            {!fornecedor && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Dados da Empresa</CardTitle>
                  <CardDescription>Preencha os dados da sua empresa para participar</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Razão Social *</Label>
                      <Input
                        value={dadosEmpresa.razao_social}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, razao_social: e.target.value }))}
                        className={errors.razao_social ? "border-red-500" : ""}
                      />
                      {errors.razao_social && <p className="text-sm text-red-500 mt-1">{errors.razao_social}</p>}
                    </div>

                    <div>
                      <Label>CNPJ *</Label>
                      <Input
                        value={dadosEmpresa.cnpj}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, cnpj: formatarCNPJ(e.target.value) }))}
                        maxLength={18}
                        className={errors.cnpj ? "border-red-500" : ""}
                      />
                      {errors.cnpj && <p className="text-sm text-red-500 mt-1">{errors.cnpj}</p>}
                    </div>

                    <div>
                      <Label>CEP *</Label>
                      <Input
                        value={dadosEmpresa.cep}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, cep: e.target.value }))}
                        className={errors.cep ? "border-red-500" : ""}
                      />
                      {errors.cep && <p className="text-sm text-red-500 mt-1">{errors.cep}</p>}
                    </div>

                    <div>
                      <Label>Logradouro *</Label>
                      <Input
                        value={dadosEmpresa.logradouro}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, logradouro: e.target.value }))}
                        className={errors.logradouro ? "border-red-500" : ""}
                      />
                      {errors.logradouro && <p className="text-sm text-red-500 mt-1">{errors.logradouro}</p>}
                    </div>

                    <div>
                      <Label>Número *</Label>
                      <Input
                        value={dadosEmpresa.numero}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, numero: e.target.value }))}
                        className={errors.numero ? "border-red-500" : ""}
                      />
                      {errors.numero && <p className="text-sm text-red-500 mt-1">{errors.numero}</p>}
                    </div>

                    <div>
                      <Label>Bairro *</Label>
                      <Input
                        value={dadosEmpresa.bairro}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, bairro: e.target.value }))}
                        className={errors.bairro ? "border-red-500" : ""}
                      />
                      {errors.bairro && <p className="text-sm text-red-500 mt-1">{errors.bairro}</p>}
                    </div>

                    <div>
                      <Label>Município *</Label>
                      <Input
                        value={dadosEmpresa.municipio}
                        onChange={(e) => setDadosEmpresa(prev => ({ ...prev, municipio: e.target.value }))}
                        className={errors.municipio ? "border-red-500" : ""}
                      />
                      {errors.municipio && <p className="text-sm text-red-500 mt-1">{errors.municipio}</p>}
                    </div>

                    <div>
                      <Label>UF *</Label>
                      <Select value={dadosEmpresa.uf} onValueChange={(value) => setDadosEmpresa(prev => ({ ...prev, uf: value }))}>
                        <SelectTrigger className={errors.uf ? "border-red-500" : ""}>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {UFS.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {errors.uf && <p className="text-sm text-red-500 mt-1">{errors.uf}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proposta de Valores */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Registrar Proposta</CardTitle>
                <CardDescription>Informe seus valores para os itens da seleção</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Qtd</TableHead>
                      <TableHead>Unid.</TableHead>
                      {processo?.tipo === "material" && <TableHead>Marca</TableHead>}
                      <TableHead className="text-right">Vlr. Unit. Est.</TableHead>
                      <TableHead className="text-right">Seu Valor Unit.</TableHead>
                      <TableHead className="text-right">Vlr. Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processo?.criterio_julgamento === 'por_lote' ? (
                      <>
                        {lotes.map(lote => {
                          const itensLote = itens.filter(i => i.lote_id === lote.id);
                          return (
                            <React.Fragment key={lote.id}>
                              <TableRow className="bg-muted/50">
                                <TableCell colSpan={8} className="font-semibold">
                                  Lote {lote.numero_lote} - {lote.descricao_lote}
                                </TableCell>
                              </TableRow>
                              {itensLote.map(item => (
                                <TableRow key={item.id}>
                                  <TableCell>{item.numero_item}</TableCell>
                                  <TableCell>{item.descricao}</TableCell>
                                  <TableCell className="text-center">{item.quantidade}</TableCell>
                                  <TableCell className="text-center">{item.unidade}</TableCell>
                                  {processo?.tipo === "material" && (
                                    <TableCell>
                                      <Input
                                        placeholder="Marca"
                                        value={respostas[item.id]?.marca_ofertada || ""}
                                        onChange={(e) => handleMarcaChange(item.id, e.target.value)}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell className="text-right">{formatCurrency(item.valor_unitario_estimado)}</TableCell>
                                  <TableCell>
                                    <Input
                                      placeholder="0,00"
                                      value={respostas[item.id]?.valor_display || ""}
                                      onChange={(e) => handleValorChange(item.id, e.target.value)}
                                      className="text-right"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency((respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        {itens.map(item => (
                          <TableRow key={item.id}>
                            <TableCell>{item.numero_item}</TableCell>
                            <TableCell>{item.descricao}</TableCell>
                            <TableCell className="text-center">{item.quantidade}</TableCell>
                            <TableCell className="text-center">{item.unidade}</TableCell>
                            {processo?.tipo === "material" && (
                              <TableCell>
                                <Input
                                  placeholder="Marca"
                                  value={respostas[item.id]?.marca_ofertada || ""}
                                  onChange={(e) => handleMarcaChange(item.id, e.target.value)}
                                />
                              </TableCell>
                            )}
                            <TableCell className="text-right">{formatCurrency(item.valor_unitario_estimado)}</TableCell>
                            <TableCell>
                              <Input
                                placeholder="0,00"
                                value={respostas[item.id]?.valor_display || ""}
                                onChange={(e) => handleValorChange(item.id, e.target.value)}
                                className="text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency((respostas[item.id]?.valor_unitario_ofertado || 0) * item.quantidade)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}
                    <TableRow className="bg-muted font-bold">
                      <TableCell colSpan={processo?.tipo === "material" ? 7 : 6} className="text-right">
                        VALOR TOTAL
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(calcularValorTotal())}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                
                <div className="mt-6 space-y-4">
                  <div>
                    <Label>Observações</Label>
                    <Textarea
                      value={observacoes}
                      onChange={(e) => setObservacoes(e.target.value)}
                      placeholder="Observações sobre a proposta (opcional)"
                      rows={4}
                    />
                  </div>

                  <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
                    <Send className="h-4 w-4 mr-2" />
                    {submitting ? "Enviando..." : "Enviar Proposta"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-green-600">✓ Proposta Enviada</CardTitle>
              <CardDescription>
                Sua proposta foi recebida com sucesso! Aguarde a data e horário da sessão de disputa para participar dos lances.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <strong>Data da Sessão:</strong> {selecao?.data_sessao_disputa?.split('T')[0].split('-').reverse().join('/')}
                </p>
                <p className="text-sm">
                  <strong>Horário:</strong> {selecao?.hora_sessao_disputa}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botão Voltar */}
        <div className="text-center">
          <Button variant="outline" onClick={() => navigate("/portal-fornecedor")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Portal do Fornecedor
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ParticiparSelecao;
