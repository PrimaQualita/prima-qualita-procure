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
import { ArrowLeft, Plus, Edit, Trash2, Eye, FileText, Copy, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

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
  cnpj: string;
  email: string;
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
  const [relatorioKPMG, setRelatorioKPMG] = useState<File | null>(null);
  const [dataValidadeCertificado, setDataValidadeCertificado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [processando, setProcessando] = useState(false);
  
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
    setLoading(false);
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
        .order("data_cadastro", { ascending: false });

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
    setRelatorioKPMG(null);
    setDataValidadeCertificado("");
    
    const { data: docs } = await supabase
      .from("documentos_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedor.id);
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

  const handleProcessarAvaliacao = async () => {
    if (!fornecedorSelecionado || !acao) return;

    if (acao === "aprovar" && (!certificado || !relatorioKPMG || !dataValidadeCertificado)) {
      toast.error("Para aprovar, é necessário anexar o Certificado, o Relatório da KPMG e informar a data de validade do certificado");
      return;
    }

    setProcessando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (acao === "aprovar") {
        // Upload certificado
        if (certificado) {
          const certFileName = `fornecedor_${fornecedorSelecionado.id}/certificado_${Date.now()}.pdf`;
          const { error: certUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(certFileName, certificado);

          if (certUploadError) throw certUploadError;

          const { data: { publicUrl: certUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(certFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: fornecedorSelecionado.id,
            tipo_documento: "certificado_gestor",
            nome_arquivo: certificado.name,
            url_arquivo: certUrl,
            em_vigor: true
          });
        }

        // Upload relatório KPMG
        if (relatorioKPMG) {
          const kpmgFileName = `fornecedor_${fornecedorSelecionado.id}/relatorio_kpmg_${Date.now()}.pdf`;
          const { error: kpmgUploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(kpmgFileName, relatorioKPMG);

          if (kpmgUploadError) throw kpmgUploadError;

          const { data: { publicUrl: kpmgUrl } } = supabase.storage
            .from("processo-anexos")
            .getPublicUrl(kpmgFileName);

          await supabase.from("documentos_fornecedor").insert({
            fornecedor_id: fornecedorSelecionado.id,
            tipo_documento: "relatorio_kpmg",
            nome_arquivo: relatorioKPMG.name,
            url_arquivo: kpmgUrl,
            em_vigor: true
          });
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
      // 1. Buscar o user_id do fornecedor ANTES de excluir
      const { data: fornecedorData, error: fetchError } = await supabase
        .from("fornecedores")
        .select("user_id")
        .eq("id", fornecedorParaExcluir)
        .single();

      if (fetchError) {
        console.error("Erro ao buscar fornecedor:", fetchError);
        throw fetchError;
      }

      console.log("Fornecedor encontrado, user_id:", fornecedorData?.user_id);

      // 2. Se o fornecedor tem user_id, deletar o usuário de autenticação PRIMEIRO
      if (fornecedorData?.user_id) {
        console.log("Chamando edge function para deletar usuário:", fornecedorData.user_id);
        
        const { data: deleteUserData, error: authError } = await supabase.functions.invoke(
          "deletar-usuario-admin",
          {
            body: { userId: fornecedorData.user_id },
          }
        );

        console.log("Resposta da edge function:", deleteUserData, authError);

        if (authError) {
          console.error("Erro ao deletar usuário de autenticação:", authError);
          toast.error("Erro ao excluir acesso do fornecedor. Tente novamente.");
          return;
        }
      }

      // 3. Agora deletar o registro de fornecedor
      const { error: deleteError } = await supabase
        .from("fornecedores")
        .delete()
        .eq("id", fornecedorParaExcluir);

      if (deleteError) {
        console.error("Erro ao deletar fornecedor:", deleteError);
        throw deleteError;
      }

      toast.success("Fornecedor excluído com sucesso!");
      loadFornecedores();
    } catch (error: any) {
      console.error("Erro no processo de exclusão:", error);
      toast.error("Erro ao excluir fornecedor: " + error.message);
    } finally {
      setFornecedorParaExcluir(null);
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
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-12" />
            <div>
              <h1 className="text-xl font-bold">Cadastro de Fornecedores</h1>
              <p className="text-sm text-muted-foreground">Gerencie perguntas, fornecedores e avaliações</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        {/* Perguntas Ativas */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Perguntas Ativas</CardTitle>
                <CardDescription>Perguntas de Due Diligence para fornecedores</CardDescription>
              </div>
              <Button onClick={() => handleAbrirDialogPergunta()}>
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
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => handleAbrirDialogPergunta(pergunta)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setPerguntaParaExcluir(pergunta.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
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
          <CardContent>
            {fornecedores.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum fornecedor cadastrado ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Data Cadastro</TableHead>
                    <TableHead>Validade Cert.</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fornecedores.map((fornecedor) => (
                    <TableRow key={fornecedor.id}>
                      <TableCell>{getStatusBadge(fornecedor.status_aprovacao)}</TableCell>
                      <TableCell className="font-medium">{fornecedor.razao_social}</TableCell>
                      <TableCell>{fornecedor.cnpj}</TableCell>
                      <TableCell>{fornecedor.email}</TableCell>
                      <TableCell>
                        {new Date(fornecedor.data_cadastro).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {fornecedor.data_validade_certificado 
                          ? new Date(fornecedor.data_validade_certificado).toLocaleDateString()
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
                          {isGestor && (
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
                  ))}
                </TableBody>
              </Table>
            )}
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
            {/* Documentos */}
            <div>
              <h3 className="font-semibold mb-2">Documentos Anexados</h3>
              <div className="space-y-2">
                {documentosFornecedor.filter(doc => doc.em_vigor).map((doc) => {
                  const DOCUMENTOS_VALIDADE = [
                    { tipo: "cnd_federal", label: "CND Federal", temValidade: true },
                    { tipo: "cnd_tributos_estaduais", label: "CND Tributos Estaduais", temValidade: true },
                    { tipo: "cnd_divida_ativa_estadual", label: "CND Dívida Ativa Estadual", temValidade: true },
                    { tipo: "cnd_tributos_municipais", label: "CND Tributos Municipais", temValidade: true },
                    { tipo: "cnd_divida_ativa_municipal", label: "CND Dívida Ativa Municipal", temValidade: true },
                    { tipo: "crf_fgts", label: "CRF FGTS", temValidade: true },
                    { tipo: "cndt", label: "CNDT", temValidade: true },
                    { tipo: "contrato_social", label: "Contrato Social Consolidado", temValidade: false },
                    { tipo: "cartao_cnpj", label: "Cartão CNPJ", temValidade: false },
                  ];
                  const tipoDocInfo = DOCUMENTOS_VALIDADE.find(d => d.tipo === doc.tipo_documento);
                  const temValidade = tipoDocInfo?.temValidade || false;
                  
                  return (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <p className="font-medium">{tipoDocInfo?.label || doc.tipo_documento}</p>
                          <p className="text-sm text-muted-foreground">{doc.nome_arquivo}</p>
                          {temValidade && (
                            <div className="mt-1">
                              {doc.data_validade ? (
                                <p className="text-xs">
                                  <span className="font-medium">Validade:</span>{" "}
                                  {new Date(doc.data_validade).toLocaleDateString('pt-BR')}
                                </p>
                              ) : (
                                <p className="text-xs text-amber-600 font-medium">
                                  Data de validade não extraída
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const pathMatch = doc.url_arquivo.match(/processo-anexos\/(.+)$/);
                            if (!pathMatch) {
                              toast.error("URL do documento inválida");
                              return;
                            }
                            const filePath = pathMatch[1];
                            const { data, error } = await supabase.storage
                              .from('processo-anexos')
                              .createSignedUrl(filePath, 60);
                            if (error) throw error;
                            if (!data?.signedUrl) throw new Error("Não foi possível gerar URL de acesso");
                            window.open(data.signedUrl, '_blank');
                          } catch (error) {
                            console.error("Erro ao abrir documento:", error);
                            toast.error("Erro ao visualizar documento");
                          }
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Visualizar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Respostas Due Diligence */}
            <div>
              <h3 className="font-semibold mb-2">Respostas Due Diligence</h3>
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
                    Score Total: <span className={getNivelPontuacao(calcularScore()).cor}>{calcularScore()} pontos</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Classificação de Risco: <span className={getNivelPontuacao(calcularScore()).cor + " font-semibold"}>
                      {getNivelPontuacao(calcularScore()).label.toUpperCase()}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Ação */}
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

            {/* Campos de aprovação */}
            {acao === "aprovar" && (
              <>
                <div>
                  <Label htmlFor="certificado">Certificado de Fornecedor *</Label>
                  <Input
                    id="certificado"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setCertificado(e.target.files?.[0] || null)}
                  />
                </div>

                <div>
                  <Label htmlFor="relatorio_kpmg">Relatório da KPMG *</Label>
                  <Input
                    id="relatorio_kpmg"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setRelatorioKPMG(e.target.files?.[0] || null)}
                  />
                </div>

                <div>
                  <Label htmlFor="data_validade_cert">Data de Validade do Certificado *</Label>
                  <Input
                    id="data_validade_cert"
                    type="date"
                    value={dataValidadeCertificado}
                    onChange={(e) => setDataValidadeCertificado(e.target.value)}
                  />
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
