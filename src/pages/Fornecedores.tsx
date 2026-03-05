import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import primaLogo from "@/assets/prima-qualita-logo.png";
import { ArrowLeft, Plus, Edit, Trash2, Eye, FileText, Copy, CheckCircle, XCircle, Send, Clock, RotateCcw, Search, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import GestaoDocumentosGestor from "@/components/fornecedores/GestaoDocumentosGestor";
import { useCanEdit, useCanResetPassword } from "@/hooks/useUserContext";

interface Pergunta {
  id: string;
  texto_pergunta: string;
  ordem: number;
  pontuacao_sim: number;
  pontuacao_nao: number;
  ativo: boolean;
}

interface Fornecedor {
  id: string;
  user_id?: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj: string;
  email: string;
  telefone: string;
  endereco_comercial?: string | null;
  segmento_atividade?: string | null;
  responsaveis_legais?: any;
  status_aprovacao: string;
  data_cadastro: string;
  data_validade_certificado?: string;
}

interface RespostaDueDiligence {
  id: string;
  resposta_texto: string;
  perguntas_due_diligence: {
    texto_pergunta: string;
    pontuacao_sim: number;
    pontuacao_nao: number;
  };
}

export default function Fornecedores() {
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const canResetPassword = useCanResetPassword();
  const [loading, setLoading] = useState(true);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [isGestor, setIsGestor] = useState(false);
  
  const [dialogPerguntaOpen, setDialogPerguntaOpen] = useState(false);
  const [perguntaParaEditar, setPerguntaParaEditar] = useState<Pergunta | null>(null);
  const [perguntaParaExcluir, setPerguntaParaExcluir] = useState<string | null>(null);
  const [fornecedorParaExcluir, setFornecedorParaExcluir] = useState<string | null>(null);
  
  const [dialogAvaliacaoOpen, setDialogAvaliacaoOpen] = useState(false);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [documentosFornecedor, setDocumentosFornecedor] = useState<any[]>([]);
  const [respostasDueDiligence, setRespostasDueDiligence] = useState<RespostaDueDiligence[]>([]);
  const [acao, setAcao] = useState<"aprovar" | "reprovar" | null>(null);
  
  const [certificado, setCertificado] = useState<File | null>(null);
  const [dataValidadeCertificado, setDataValidadeCertificado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [processando, setProcessando] = useState(false);
  const [extraindoDataCertificado, setExtraindoDataCertificado] = useState(false);
  const [avaliacoesCompliance, setAvaliacoesCompliance] = useState<Record<string, any>>({});
  const [enviandoCompliance, setEnviandoCompliance] = useState<string | null>(null);
  const [resetandoSenha, setResetandoSenha] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroCnpj, setFiltroCnpj] = useState("");
  const [filtroCnae, setFiltroCnae] = useState("");
  const [filtroCnaeDescricao, setFiltroCnaeDescricao] = useState("");
  const [cnaesMap, setCnaesMap] = useState<Record<string, { codigo_cnae: string; descricao: string }[]>>({});
  
  const [formDataPergunta, setFormDataPergunta] = useState({
    texto_pergunta: "",
    ordem: 0,
    pontuacao_sim: 0,
    pontuacao_nao: 200,
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "gestor")
      .maybeSingle();

    setIsGestor(!!roleData);
    loadPerguntas();
    loadFornecedores();
    loadAvaliacoesCompliance();
    loadCnaesFornecedores();
    setLoading(false);
  };

  const loadCnaesFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("cnaes_fornecedor")
        .select("fornecedor_id, codigo_cnae, descricao");
      if (error) throw error;
      const map: Record<string, { codigo_cnae: string; descricao: string }[]> = {};
      data?.forEach((item: any) => {
        if (!map[item.fornecedor_id]) map[item.fornecedor_id] = [];
        map[item.fornecedor_id].push({ codigo_cnae: item.codigo_cnae, descricao: item.descricao || "" });
      });
      setCnaesMap(map);
    } catch (error) {
      console.error("Erro ao carregar CNAEs:", error);
    }
  };

  const loadAvaliacoesCompliance = async () => {
    try {
      const { data, error } = await supabase
        .from("avaliacoes_cadastro_fornecedor")
        .select("*");

      if (error) throw error;
      
      const avaliacoesMap: Record<string, any> = {};
      data?.forEach((av: any) => {
        avaliacoesMap[av.fornecedor_id] = av;
      });
      setAvaliacoesCompliance(avaliacoesMap);
    } catch (error) {
      console.error("Erro ao carregar avaliações:", error);
    }
  };

  const handleEnviarCompliance = async (fornecedorId: string) => {
    setEnviandoCompliance(fornecedorId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("avaliacoes_cadastro_fornecedor")
        .insert({
          fornecedor_id: fornecedorId,
          enviado_por_id: user.id,
          status_avaliacao: "pendente",
        });

      if (error) throw error;

      toast.success("Cadastro enviado ao Compliance para análise!");
      loadAvaliacoesCompliance();
    } catch (error: any) {
      console.error("Erro ao enviar ao compliance:", error);
      toast.error(error.message || "Erro ao enviar ao compliance");
    } finally {
      setEnviandoCompliance(null);
    }
  };

  const getStatusCompliance = (fornecedorId: string) => {
    const avaliacao = avaliacoesCompliance[fornecedorId];
    if (!avaliacao) return null;
    return avaliacao.status_avaliacao;
  };

  const loadPerguntas = async () => {
    try {
      const { data, error } = await supabase
        .from("perguntas_due_diligence")
        .select("*")
        .eq("ativo", true)
        .order("ordem");

      if (error) throw error;
      setPerguntas(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar perguntas");
    }
  };

  const loadFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("*")
        .not("user_id", "is", null) // Apenas fornecedores com cadastro completo (não incluir os que só enviaram proposta de cotação)
        .order("razao_social", { ascending: true });

      if (error) throw error;
      setFornecedores(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar fornecedores");
    }
  };

  const handleAbrirDialogPergunta = (pergunta?: Pergunta) => {
    if (pergunta) {
      setPerguntaParaEditar(pergunta);
      setFormDataPergunta({
        texto_pergunta: pergunta.texto_pergunta,
        ordem: pergunta.ordem,
        pontuacao_sim: pergunta.pontuacao_sim,
        pontuacao_nao: pergunta.pontuacao_nao,
      });
    } else {
      setPerguntaParaEditar(null);
      setFormDataPergunta({
        texto_pergunta: "",
        ordem: perguntas.length + 1,
        pontuacao_sim: 0,
        pontuacao_nao: 200,
      });
    }
    setDialogPerguntaOpen(true);
  };

  const handleSalvarPergunta = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (perguntaParaEditar) {
        const { error } = await supabase
          .from("perguntas_due_diligence")
          .update(formDataPergunta)
          .eq("id", perguntaParaEditar.id);

        if (error) throw error;
        toast.success("Pergunta atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("perguntas_due_diligence")
          .insert([{ ...formDataPergunta, ativo: true }]);

        if (error) throw error;
        toast.success("Pergunta criada com sucesso!");
      }

      setDialogPerguntaOpen(false);
      loadPerguntas();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar pergunta");
    }
  };

  const handleExcluirPergunta = async () => {
    if (!perguntaParaExcluir) return;

    try {
      const { error } = await supabase
        .from("perguntas_due_diligence")
        .update({ ativo: false })
        .eq("id", perguntaParaExcluir);

      if (error) throw error;
      toast.success("Pergunta desativada com sucesso!");
      loadPerguntas();
    } catch (error: any) {
      toast.error("Erro ao desativar pergunta");
    } finally {
      setPerguntaParaExcluir(null);
    }
  };

  const handleAbrirAvaliacao = async (fornecedor: Fornecedor) => {
    setFornecedorSelecionado(fornecedor);
    setDialogAvaliacaoOpen(true);
    setAcao(null);
    setObservacoes("");
    setCertificado(null);
    setDataValidadeCertificado("");
    
    const { data: docs } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedor.id)
      .order("tipo_documento", { ascending: true })
      .order("data_upload", { ascending: false });
    setDocumentosFornecedor(docs || []);
    
    const { data: respostas } = await supabase
      .from("respostas_due_diligence_fornecedor")
      .select(`
        *,
        perguntas_due_diligence (texto_pergunta, pontuacao_sim, pontuacao_nao)
      `)
      .eq("fornecedor_id", fornecedor.id);
    setRespostasDueDiligence(respostas || []);
  };

  const calcularScore = () => {
    return respostasDueDiligence.reduce((total, resposta) => {
      const pontuacao = resposta.resposta_texto === "SIM" 
        ? resposta.perguntas_due_diligence?.pontuacao_sim 
        : resposta.perguntas_due_diligence?.pontuacao_nao;
      return total + (pontuacao || 0);
    }, 0);
  };

  const handleExtrairDataCertificado = async (arquivo: File) => {
    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = reader.result as string;
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(arquivo);
      });

      const pdfBase64 = await base64Promise;

      // Chamar edge function para extrair data
      const { data, error } = await supabase.functions.invoke('extrair-data-pdf', {
        body: {
          pdfBase64,
          tipoDocumento: 'certificado_gestor'
        }
      });

      if (error) {
        console.error("Erro ao extrair data:", error);
        return { dataValidade: null, isScanned: false };
      }

      return { dataValidade: data.dataValidade, isScanned: data.isScanned || false };
    } catch (error) {
      console.error("Erro ao processar PDF:", error);
      return { dataValidade: null, isScanned: false };
    }
  };

  const handleCertificadoSelecionado = async (arquivo: File | null) => {
    setCertificado(arquivo);
    
    if (!arquivo) {
      setDataValidadeCertificado("");
      return;
    }

    // Extrair data de validade automaticamente
    setExtraindoDataCertificado(true);
    toast.info("Extraindo data de validade do certificado...");
    
    const resultado = await handleExtrairDataCertificado(arquivo);
    setExtraindoDataCertificado(false);
    
    if (resultado?.dataValidade) {
      setDataValidadeCertificado(resultado.dataValidade);
      toast.success("Data de validade extraída automaticamente!");
    } else if (resultado?.isScanned) {
      toast.warning("PDF digitalizado detectado. Por favor, informe a data de validade manualmente.");
      setDataValidadeCertificado("");
    } else {
      toast.warning("Não foi possível extrair a data automaticamente. Por favor, informe manualmente.");
      setDataValidadeCertificado("");
    }
  };


  const handleProcessarAvaliacao = async () => {
    if (!fornecedorSelecionado || !acao) return;

    if (acao === "aprovar" && (!certificado || !dataValidadeCertificado)) {
      toast.error("Para aprovar, é necessário anexar o Certificado e informar a data de validade do certificado");
      return;
    }

    setProcessando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (acao === "aprovar") {
        // Upload certificado
        if (certificado) {
          console.log("Iniciando upload do certificado...");
          const certFileName = `fornecedor_${fornecedorSelecionado.id}/certificado_${Date.now()}.pdf`;
          const { error: certUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(certFileName, certificado);

          if (certUploadError) {
            console.error("Erro ao fazer upload do certificado:", certUploadError);
            throw certUploadError;
          }

          const { data: { publicUrl: certUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(certFileName);

          console.log("Certificado upado, salvando no banco:", certUrl);

          // Converter data para formato ISO sem problemas de timezone
          const dataValidadeISO = dataValidadeCertificado 
            ? `${dataValidadeCertificado}T00:00:00.000Z`
            : null;

          const { error: certInsertError } = await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: fornecedorSelecionado.id,
            tipo_documento: "certificado_gestor",
            nome_arquivo: certificado.name,
            url_arquivo: certUrl,
            data_validade: dataValidadeISO,
            em_vigor: true
          });

          if (certInsertError) {
            console.error("Erro ao inserir certificado no banco:", certInsertError);
            throw certInsertError;
          }
          console.log("Certificado salvo com sucesso!");
        } else {
          console.warn("Certificado não foi selecionado!");
        }

      }

      // Atualizar fornecedor
      // Converter data para formato ISO sem problemas de timezone
      const dataValidadeISO = dataValidadeCertificado 
        ? `${dataValidadeCertificado}T00:00:00.000Z`
        : null;

      const { error: updateError } = await supabase
        .from("fornecedores")
        .update({
          status_aprovacao: acao === "aprovar" ? "aprovado" : "reprovado",
          data_aprovacao: new Date().toISOString(),
          gestor_aprovador_id: user.id,
          observacoes_gestor: observacoes,
          data_validade_certificado: acao === "aprovar" ? dataValidadeISO : null,
          ativo: acao === "aprovar"
        })
        .eq("id", fornecedorSelecionado.id);

      if (updateError) throw updateError;

      toast.success(`Fornecedor ${acao === "aprovar" ? "aprovado" : "reprovado"} com sucesso!`);
      setDialogAvaliacaoOpen(false);
      loadFornecedores();

    } catch (error: any) {
      console.error("Erro ao processar fornecedor:", error);
      toast.error(error.message || "Erro ao processar fornecedor");
    } finally {
      setProcessando(false);
    }
  };

  const handleExcluirFornecedor = async () => {
    if (!fornecedorParaExcluir) return;

    try {
      const { data, error } = await supabase.functions.invoke("deletar-fornecedor", {
        body: { fornecedorId: fornecedorParaExcluir },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Fornecedor excluído com sucesso!");
      loadFornecedores();
    } catch (error: any) {
      console.error("Erro no processo de exclusão:", error);
      toast.error("Erro ao excluir fornecedor: " + error.message);
    } finally {
      setFornecedorParaExcluir(null);
    }
  };

  const handleResetSenhaFornecedor = async (fornecedorId: string) => {
    setResetandoSenha(fornecedorId);
    try {
      const { data, error } = await supabase.functions.invoke("resetar-senha-fornecedor", {
        body: { fornecedorId },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("Senha resetada com sucesso! A nova senha temporária é o CNPJ (apenas números, 14 dígitos). O fornecedor deverá trocá-la no próximo login.");
      loadFornecedores();
    } catch (error: any) {
      toast.error("Erro ao resetar senha: " + error.message);
    } finally {
      setResetandoSenha(null);
    }
  };

  const getNivelPontuacao = (pontos: number) => {
    if (pontos === 0) {
      return { label: "Satisfatório", cor: "text-green-600", bg: "bg-green-500/10" };
    }
    return { label: "Não Satisfatório", cor: "text-red-600", bg: "bg-red-500/10" };
  };

  const copiarLinkFormulario = () => {
    const link = `${window.location.origin}/cadastro-fornecedor`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendente":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">Pendente</Badge>;
      case "aprovado":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600">Aprovado</Badge>;
      case "reprovado":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600">Reprovado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Perguntas Ativas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Perguntas Ativas</CardTitle>
                <CardDescription>Perguntas de Due Diligence para fornecedores</CardDescription>
              </div>
              <Button onClick={() => handleAbrirDialogPergunta()} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Pergunta
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {perguntas.map((pergunta, index) => (
              <div key={pergunta.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm">{pergunta.texto_pergunta}</p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className={getNivelPontuacao(pergunta.pontuacao_sim).bg + " " + getNivelPontuacao(pergunta.pontuacao_sim).cor}>
                      SIM: {pergunta.pontuacao_sim} pts ({getNivelPontuacao(pergunta.pontuacao_sim).label})
                    </Badge>
                    <Badge variant="outline" className={getNivelPontuacao(pergunta.pontuacao_nao).bg + " " + getNivelPontuacao(pergunta.pontuacao_nao).cor}>
                      NÃO: {pergunta.pontuacao_nao} pts ({getNivelPontuacao(pergunta.pontuacao_nao).label})
                    </Badge>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleAbrirDialogPergunta(pergunta)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setPerguntaParaExcluir(pergunta.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {perguntas.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma pergunta cadastrada. Clique em 'Nova Pergunta' para começar.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Link para Formulário */}
        <Card>
          <CardHeader>
            <CardTitle>Link para Formulário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/cadastro-fornecedor`}
                className="flex-1"
              />
              <Button onClick={copiarLinkFormulario}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Compartilhe este link com fornecedores para preenchimento do formulário
            </p>
          </CardContent>
        </Card>

        {/* Fornecedores Cadastrados */}
        <Card>
          <CardHeader>
            <CardTitle>Fornecedores Cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-hidden">
            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <div>
                <Label className="text-xs mb-1 block">Status</Label>
                <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="reprovado">Reprovado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Empresa</Label>
                <Input
                  placeholder="Razão social..."
                  value={filtroEmpresa}
                  onChange={(e) => setFiltroEmpresa(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">CNPJ</Label>
                <Input
                  placeholder="XX.XXX.XXX/XXXX-XX ou números"
                  value={filtroCnpj}
                  onChange={(e) => setFiltroCnpj(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">CNAE (código)</Label>
                <Input
                  placeholder="XX.XX-X-XX ou números"
                  value={filtroCnae}
                  onChange={(e) => setFiltroCnae(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">CNAE (atividade)</Label>
                <Input
                  placeholder="Ex: limpeza, transporte..."
                  value={filtroCnaeDescricao}
                  onChange={(e) => setFiltroCnaeDescricao(e.target.value)}
                />
              </div>
            </div>

            {(() => {
              const normalizar = (v: string) => v.replace(/[.\-\/]/g, "").toLowerCase().trim();
              const descricaoBusca = filtroCnaeDescricao.toLowerCase().trim();
              const fornecedoresFiltrados = fornecedores.filter((f) => {
                if (filtroStatus !== "todos" && f.status_aprovacao !== filtroStatus) return false;
                if (filtroEmpresa && !f.razao_social.toLowerCase().includes(filtroEmpresa.toLowerCase().trim())) return false;
                if (filtroCnpj) {
                  const cnpjBusca = normalizar(filtroCnpj);
                  const cnpjFornecedor = normalizar(f.cnpj);
                  if (!cnpjFornecedor.includes(cnpjBusca)) return false;
                }
                if (filtroCnae) {
                  const cnaeBusca = normalizar(filtroCnae);
                  const cnaes = cnaesMap[f.id] || [];
                  if (!cnaes.some(c => normalizar(c.codigo_cnae).includes(cnaeBusca))) return false;
                }
                if (descricaoBusca) {
                  const cnaes = cnaesMap[f.id] || [];
                  if (!cnaes.some(c => c.descricao.toLowerCase().includes(descricaoBusca))) return false;
                }
                return true;
              });

              // Compute matching CNAEs for display when filtering by description
              const getCnaesCorrespondentes = (fornecedorId: string) => {
                if (!descricaoBusca) return [];
                const cnaes = cnaesMap[fornecedorId] || [];
                return cnaes.filter(c => c.descricao.toLowerCase().includes(descricaoBusca));
              };

              if (fornecedoresFiltrados.length === 0) {
                return (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum fornecedor encontrado com os filtros aplicados.
                  </p>
                );
              }

              return (
                <div className="w-full overflow-x-hidden">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Status</TableHead>
                        <TableHead className="w-[24%]">Empresa</TableHead>
                        <TableHead className="w-[14%]">CNPJ</TableHead>
                        <TableHead className="w-[22%]">Email</TableHead>
                        <TableHead className="w-[12%]">Data Cadastro</TableHead>
                        <TableHead className="w-[12%]">Validade Cert.</TableHead>
                        <TableHead className="w-[120px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fornecedoresFiltrados.map((fornecedor) => {
                        const cnaesCorrespondentes = getCnaesCorrespondentes(fornecedor.id);
                        return (
                        <TableRow key={fornecedor.id}>
                          <TableCell>{getStatusBadge(fornecedor.status_aprovacao)}</TableCell>
                          <TableCell className="font-medium break-words whitespace-normal">
                            <div>{fornecedor.razao_social}</div>
                            {cnaesCorrespondentes.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {cnaesCorrespondentes.map((cnae, idx) => (
                                  <div key={idx} className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 inline-block mr-1 mb-0.5">
                                    <span className="font-medium">{cnae.codigo_cnae}</span> – {cnae.descricao}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="break-all">{fornecedor.cnpj}</TableCell>
                          <TableCell className="break-all">{fornecedor.email}</TableCell>
                          <TableCell>
                            {fornecedor.data_cadastro 
                              ? (() => {
                                  const dateStr = fornecedor.data_cadastro.split('T')[0];
                                  const [year, month, day] = dateStr.split('-');
                                  return `${day}/${month}/${year}`;
                                })()
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {fornecedor.data_validade_certificado 
                              ? (() => {
                                  const dateStr = fornecedor.data_validade_certificado.split('T')[0];
                                  const [year, month, day] = dateStr.split('-');
                                  return `${day}/${month}/${year}`;
                                })()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleAbrirAvaliacao(fornecedor)}
                                title="Ver Detalhes"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {canResetPassword && fornecedor.user_id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleResetSenhaFornecedor(fornecedor.id)}
                                  disabled={resetandoSenha === fornecedor.id}
                                  title="Resetar senha para CNPJ"
                                >
                                  <RotateCcw className={`h-4 w-4 ${resetandoSenha === fornecedor.id ? 'animate-spin' : ''}`} />
                                </Button>
                              )}
                              {isGestor && canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setFornecedorParaExcluir(fornecedor.id)}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Nova/Editar Pergunta */}
      <Dialog open={dialogPerguntaOpen} onOpenChange={setDialogPerguntaOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{perguntaParaEditar ? "Editar Pergunta" : "Nova Pergunta"}</DialogTitle>
            <DialogDescription>
              Configure a pergunta de due diligence e as pontuações para cada resposta
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarPergunta} className="space-y-4">
            <div>
              <Label htmlFor="texto_pergunta">Texto da Pergunta</Label>
              <Textarea
                id="texto_pergunta"
                value={formDataPergunta.texto_pergunta}
                onChange={(e) => setFormDataPergunta({...formDataPergunta, texto_pergunta: e.target.value})}
                rows={3}
                required
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="ordem">Ordem</Label>
                <Input
                  id="ordem"
                  type="number"
                  value={formDataPergunta.ordem}
                  onChange={(e) => setFormDataPergunta({...formDataPergunta, ordem: parseInt(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="pontuacao_sim">Pontuação SIM</Label>
                <Input
                  id="pontuacao_sim"
                  type="number"
                  value={formDataPergunta.pontuacao_sim}
                  onChange={(e) => setFormDataPergunta({...formDataPergunta, pontuacao_sim: parseInt(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="pontuacao_nao">Pontuação NÃO</Label>
                <Input
                  id="pontuacao_nao"
                  type="number"
                  value={formDataPergunta.pontuacao_nao}
                  onChange={(e) => setFormDataPergunta({...formDataPergunta, pontuacao_nao: parseInt(e.target.value)})}
                  required
                />
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="text-sm font-semibold">Níveis de Risco:</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• <span className="text-green-600 font-semibold">0 pontos = Satisfatório</span> (baixo risco)</li>
                <li>• <span className="text-red-600 font-semibold">200 pontos = Não Satisfatório</span> (alto risco)</li>
              </ul>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogPerguntaOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar Pergunta</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Avaliar Fornecedor */}
      <Dialog open={dialogAvaliacaoOpen} onOpenChange={setDialogAvaliacaoOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliar Fornecedor: {fornecedorSelecionado?.razao_social}</DialogTitle>
            <DialogDescription>
              Revise as informações, documentos e respostas antes de aprovar ou reprovar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Dados Cadastrais do Fornecedor */}
            {fornecedorSelecionado && (
              <div>
                <h3 className="font-semibold mb-2">Dados Cadastrais</h3>
                <div className="grid grid-cols-2 gap-3 text-sm p-4 border rounded-lg bg-muted/30">
                  <div>
                    <p className="text-muted-foreground text-xs">Razão Social</p>
                    <p className="font-medium">{fornecedorSelecionado.razao_social}</p>
                  </div>
                  {fornecedorSelecionado.nome_fantasia && (
                    <div>
                      <p className="text-muted-foreground text-xs">Nome Fantasia</p>
                      <p className="font-medium">{fornecedorSelecionado.nome_fantasia}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">CNPJ</p>
                    <p className="font-medium">{fornecedorSelecionado.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">E-mail</p>
                    <p className="font-medium">{fornecedorSelecionado.email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Telefone</p>
                    <p className="font-medium">{fornecedorSelecionado.telefone || '-'}</p>
                  </div>
                  {fornecedorSelecionado.segmento_atividade && (
                    <div>
                      <p className="text-muted-foreground text-xs">Segmento de Atividade</p>
                      <p className="font-medium">{fornecedorSelecionado.segmento_atividade}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Endereço Comercial</p>
                    <p className="font-medium">{fornecedorSelecionado.endereco_comercial || '-'}</p>
                  </div>
                  {fornecedorSelecionado.responsaveis_legais && Array.isArray(fornecedorSelecionado.responsaveis_legais) && fornecedorSelecionado.responsaveis_legais.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs">Responsável(is) Legal(is)</p>
                      <ul className="font-medium list-disc list-inside">
                        {fornecedorSelecionado.responsaveis_legais.map((resp: string, idx: number) => (
                          <li key={idx}>{resp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">Data de Cadastro</p>
                    <p className="font-medium">
                      {fornecedorSelecionado.data_cadastro 
                        ? new Date(fornecedorSelecionado.data_cadastro).toLocaleString('pt-BR') 
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Status</p>
                    {getStatusBadge(fornecedorSelecionado.status_aprovacao)}
                  </div>
                </div>
              </div>
            )}

            {/* Gestão de Documentos pelo Gestor */}
            {fornecedorSelecionado && (
              <div>
                <GestaoDocumentosGestor fornecedorId={fornecedorSelecionado.id} />
              </div>
            )}

            {/* Respostas Due Diligence */}
            <div>
              <h3 className="font-semibold mb-2">Questionário de Conflito de Interesse</h3>
              <div className="space-y-2">
                {respostasDueDiligence.map((resposta) => (
                  <div key={resposta.id} className="p-3 border rounded-lg">
                    <p className="text-sm mb-2">{resposta.perguntas_due_diligence.texto_pergunta}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={resposta.resposta_texto === "SIM" ? "default" : "secondary"}>
                        {resposta.resposta_texto}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Pontos: {resposta.resposta_texto === "SIM" 
                          ? resposta.perguntas_due_diligence.pontuacao_sim 
                          : resposta.perguntas_due_diligence.pontuacao_nao}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {respostasDueDiligence.length > 0 && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="font-semibold text-lg">
                    Score de Conflito de Interesse: <span className={getNivelPontuacao(calcularScore()).cor}>{calcularScore()} pontos</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Classificação de Risco: <span className={getNivelPontuacao(calcularScore()).cor + " font-semibold"}>
                      {getNivelPontuacao(calcularScore()).label.toUpperCase()}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Status Compliance */}
            {fornecedorSelecionado && (
              <div className="space-y-3">
                <Label>Compliance</Label>
                {(() => {
                  const statusCompliance = getStatusCompliance(fornecedorSelecionado.id);
                  const avaliacaoCompliance = avaliacoesCompliance[fornecedorSelecionado.id];
                  
                  if (statusCompliance === "pendente") {
                    return (
                      <Alert className="bg-yellow-500/10 border-yellow-500/30">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-600">
                          Aguardando análise do Compliance
                        </AlertDescription>
                      </Alert>
                    );
                  }
                  
                  if (statusCompliance === "respondido") {
                    const classificacao = avaliacaoCompliance?.classificacao_risco;
                    const corClasse = classificacao === "satisfatorio" 
                      ? "bg-green-500/10 border-green-500/30" 
                      : classificacao === "medio"
                      ? "bg-yellow-500/10 border-yellow-500/30"
                      : "bg-red-500/10 border-red-500/30";
                    const corTexto = classificacao === "satisfatorio" 
                      ? "text-green-600" 
                      : classificacao === "medio"
                      ? "text-yellow-600"
                      : "text-red-600";
                    const labelRisco = classificacao === "satisfatorio" 
                      ? "Baixo Risco" 
                      : classificacao === "medio"
                      ? "Médio Risco"
                      : "Alto Risco";
                    
                    // Buscar documento KPMG do compliance nos documentos do fornecedor
                    const docKPMG = documentosFornecedor.find(d => d.tipo_documento === "relatorio_kpmg_compliance");
                    
                    return (
                      <div className="space-y-3">
                        <Alert className={corClasse}>
                          <CheckCircle className={`h-4 w-4 ${corTexto}`} />
                          <AlertDescription className={corTexto}>
                            Compliance: {labelRisco}
                            {avaliacaoCompliance?.score_risco_total !== null && ` (Score: ${avaliacaoCompliance.score_risco_total})`}
                          </AlertDescription>
                        </Alert>
                        
                        {/* Relatório KPMG do Compliance */}
                        {docKPMG && (
                          <div className="p-3 border rounded-lg bg-muted/50">
                            <p className="text-sm font-medium mb-2">Relatório KPMG (Compliance)</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(docKPMG.url_arquivo, "_blank")}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Visualizar Relatório
                            </Button>
                          </div>
                        )}
                        
                        {/* Observações do Compliance */}
                        {avaliacaoCompliance?.observacoes_compliance && (
                          <div className="p-3 border rounded-lg bg-muted/50">
                            <p className="text-sm font-medium mb-1">Observações do Compliance</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {avaliacaoCompliance.observacoes_compliance}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Sem avaliação de compliance - mostrar botão de enviar apenas se pendente
                  if (fornecedorSelecionado.status_aprovacao === "pendente") {
                    return (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEnviarCompliance(fornecedorSelecionado.id)}
                        disabled={enviandoCompliance === fornecedorSelecionado.id}
                        className="w-full"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        {enviandoCompliance === fornecedorSelecionado.id ? "Enviando..." : "Enviar ao Compliance"}
                      </Button>
                    );
                  }
                  
                  return (
                    <p className="text-sm text-muted-foreground">Não foi enviado ao Compliance</p>
                  );
                })()}
              </div>
            )}

            {/* Score Total Geral (Conflito de Interesse + Compliance) */}
            {fornecedorSelecionado && respostasDueDiligence.length > 0 && (() => {
              const avaliacaoCompliance = avaliacoesCompliance[fornecedorSelecionado.id];
              const scoreConflito = calcularScore();
              const scoreCompliance = avaliacaoCompliance?.score_risco_total || 0;
              const scoreTotal = scoreConflito + scoreCompliance;
              
              return (
                <div className="mt-4 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Score Conflito de Interesse</p>
                      <p className="text-2xl font-bold text-primary">{scoreConflito}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Score Due Diligence (Compliance)</p>
                      <p className="text-2xl font-bold text-primary">{scoreCompliance}</p>
                    </div>
                    
                    <div className="border-l-2 border-primary/30 pl-4">
                      <p className="text-xs text-muted-foreground mb-1 font-semibold">SCORE TOTAL</p>
                      <p className="text-3xl font-bold text-primary">{scoreTotal}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Ação */}
            {fornecedorSelecionado && fornecedorSelecionado.status_aprovacao === "pendente" && (
              <div>
                <Label>Decisão</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={acao === "aprovar" ? "default" : "outline"}
                    onClick={() => setAcao("aprovar")}
                    className="flex-1"
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    variant={acao === "reprovar" ? "destructive" : "outline"}
                    onClick={() => setAcao("reprovar")}
                    className="flex-1"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reprovar
                  </Button>
                </div>
              </div>
            )}

            {/* Campos de aprovação */}
            {acao === "aprovar" && (
              <>
                <div>
                  <Label htmlFor="certificado">Certificado de Fornecedor *</Label>
                  <Input
                    id="certificado"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleCertificadoSelecionado(e.target.files?.[0] || null)}
                    disabled={extraindoDataCertificado}
                  />
                  {certificado && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                      <FileText className="h-4 w-4" />
                      {certificado.name}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="data_validade_cert">Data de Validade do Certificado *</Label>
                  <Input
                    id="data_validade_cert"
                    type="date"
                    value={dataValidadeCertificado}
                    onChange={(e) => setDataValidadeCertificado(e.target.value)}
                    disabled={extraindoDataCertificado}
                  />
                  {extraindoDataCertificado && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Extraindo data de validade do PDF...
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Observações */}
            <div>
              <Label htmlFor="observacoes">Observações do Gestor</Label>
              <Textarea
                id="observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                placeholder="Adicione observações sobre esta avaliação..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAvaliacaoOpen(false)} disabled={processando}>
              Cancelar
            </Button>
            <Button onClick={handleProcessarAvaliacao} disabled={!acao || processando}>
              {processando ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Excluir Pergunta */}
      <AlertDialog open={!!perguntaParaExcluir} onOpenChange={() => setPerguntaParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desativar esta pergunta? Ela não aparecerá mais no formulário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirPergunta}>Desativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Excluir Fornecedor */}
      <AlertDialog open={!!fornecedorParaExcluir} onOpenChange={() => setFornecedorParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita e removerá também o acesso do fornecedor ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluirFornecedor}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
