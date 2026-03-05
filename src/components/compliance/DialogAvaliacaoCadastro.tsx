import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FileText, Upload, ExternalLink, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface Avaliacao {
  id: string;
  fornecedor_id: string;
  status_avaliacao: string;
  score_risco_total: number | null;
  classificacao_risco: string | null;
  observacoes_compliance: string | null;
  data_envio: string;
  fornecedor?: {
    id?: string;
    razao_social: string;
    cnpj: string;
    email: string;
  };
}

interface DialogAvaliacaoCadastroProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avaliacao: Avaliacao | null;
  onSuccess: () => void;
}

export function DialogAvaliacaoCadastro({
  open,
  onOpenChange,
  avaliacao,
  onSuccess,
}: DialogAvaliacaoCadastroProps) {
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [fornecedor, setFornecedor] = useState<any>(null);
  const [documentosFornecedor, setDocumentosFornecedor] = useState<any[]>([]);
  const [respostasDueDiligence, setRespostasDueDiligence] = useState<any[]>([]);
  const [scoreTotal, setScoreTotal] = useState<number>(0);
  
  // Campos do formulário
  const [relatorioKPMG, setRelatorioKPMG] = useState<File | null>(null);
  const [scoreRiscoTotal, setScoreRiscoTotal] = useState<string>("");
  const [classificacaoRisco, setClassificacaoRisco] = useState<string>("");
  const [observacoesCompliance, setObservacoesCompliance] = useState<string>("");

  // CNAEs
  interface CnaeItem {
    codigo: string;
    descricao: string;
    tipo: "primaria" | "secundaria";
  }
  const [cnaesExtraidos, setCnaesExtraidos] = useState<CnaeItem[]>([]);
  const [cnaesExistentes, setCnaesExistentes] = useState<CnaeItem[]>([]);
  const [extraindoCnaes, setExtraindoCnaes] = useState(false);
  const [cnaesSalvos, setCnaesSalvos] = useState(false);

  useEffect(() => {
    if (open && avaliacao) {
      // Resetar campos do formulário ao abrir para novo fornecedor
      setRelatorioKPMG(null);
      setScoreRiscoTotal("");
      setClassificacaoRisco("");
      setObservacoesCompliance("");
      setCnaesExtraidos([]);
      setCnaesExistentes([]);
      setCnaesSalvos(false);
      loadDados();
    } else if (!open) {
      // Limpar tudo ao fechar o diálogo
      setRelatorioKPMG(null);
      setScoreRiscoTotal("");
      setClassificacaoRisco("");
      setObservacoesCompliance("");
      setFornecedor(null);
      setDocumentosFornecedor([]);
      setRespostasDueDiligence([]);
      setScoreTotal(0);
      setCnaesExtraidos([]);
      setCnaesExistentes([]);
      setCnaesSalvos(false);
    }
  }, [open, avaliacao]);

  const loadDados = async () => {
    if (!avaliacao) return;
    
    setLoading(true);
    try {
      // Carregar dados do fornecedor
      const { data: fornecedorData, error: fornecedorError } = await supabase
        .from("fornecedores")
        .select("*")
        .eq("id", avaliacao.fornecedor_id)
        .single();

      if (fornecedorError) throw fornecedorError;
      setFornecedor(fornecedorData);

      // Carregar documentos do fornecedor
      const { data: docs } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", avaliacao.fornecedor_id);
      setDocumentosFornecedor(docs || []);

      // Carregar respostas de due diligence
      const { data: respostas } = await supabase
        .from("respostas_due_diligence_fornecedor")
        .select(`
          *,
          perguntas_due_diligence (texto_pergunta, pontuacao_sim, pontuacao_nao)
        `)
        .eq("fornecedor_id", avaliacao.fornecedor_id);
      setRespostasDueDiligence(respostas || []);

      // Calcular score total
      let score = 0;
      respostas?.forEach((r: any) => {
        if (r.resposta_texto === "SIM") {
          score += r.perguntas_due_diligence?.pontuacao_sim || 0;
        } else {
          score += r.perguntas_due_diligence?.pontuacao_nao || 0;
        }
      });
      setScoreTotal(score);

      // Preencher campos existentes se houver
      if (avaliacao.score_risco_total !== null) {
        setScoreRiscoTotal(avaliacao.score_risco_total.toString());
      }
      if (avaliacao.classificacao_risco) {
        setClassificacaoRisco(avaliacao.classificacao_risco);
      }
      if (avaliacao.observacoes_compliance) {
        setObservacoesCompliance(avaliacao.observacoes_compliance);
      }

      // Carregar CNAEs existentes do fornecedor
      const { data: cnaesData } = await supabase
        .from("cnaes_fornecedor")
        .select("codigo_cnae, descricao, tipo")
        .eq("fornecedor_id", avaliacao.fornecedor_id)
        .order("tipo")
        .order("codigo_cnae");
      
      if (cnaesData && cnaesData.length > 0) {
        const mapped = cnaesData.map((c: any) => ({
          codigo: c.codigo_cnae,
          descricao: c.descricao,
          tipo: c.tipo as "primaria" | "secundaria",
        }));
        setCnaesExistentes(mapped);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do fornecedor");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCartaoCNPJ = async (file: File) => {
    if (!avaliacao) return;
    setExtraindoCnaes(true);
    setCnaesSalvos(false);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result?.toString().split(",")[1];
        if (!base64) {
          toast.error("Erro ao ler o arquivo");
          setExtraindoCnaes(false);
          return;
        }

        try {
          const { data, error } = await supabase.functions.invoke("extrair-cnaes-cnpj", {
            body: { pdfBase64: base64 },
          });

          if (error) throw error;

          if (data.error) {
            toast.error(data.error);
            setExtraindoCnaes(false);
            return;
          }

          const cnaes = (data.cnaes || []) as CnaeItem[];
          if (cnaes.length === 0) {
            toast.warning("Nenhum CNAE encontrado no documento. Verifique se é um Comprovante de Inscrição e Situação Cadastral válido.");
            setExtraindoCnaes(false);
            return;
          }

          setCnaesExtraidos(cnaes);
          toast.success(`${cnaes.length} CNAE(s) extraído(s) com sucesso!`);
        } catch (err: any) {
          console.error("Erro ao extrair CNAEs:", err);
          toast.error(err.message || "Erro ao extrair CNAEs do documento");
        } finally {
          setExtraindoCnaes(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Erro ao processar arquivo:", err);
      toast.error("Erro ao processar o arquivo");
      setExtraindoCnaes(false);
    }
  };

  const handleSalvarCnaes = async () => {
    if (!avaliacao || cnaesExtraidos.length === 0) return;

    try {
      const fornecedorId = avaliacao.fornecedor_id;

      // Get existing CNAEs codes
      const codigosExistentes = new Set(cnaesExistentes.map((c) => c.codigo));
      const codigosExtraidos = new Set(cnaesExtraidos.map((c) => c.codigo));

      // CNAEs to remove (exist in DB but not in new extraction)
      const cnaesRemover = cnaesExistentes.filter((c) => !codigosExtraidos.has(c.codigo));
      // CNAEs to add (exist in extraction but not in DB)
      const cnaesAdicionar = cnaesExtraidos.filter((c) => !codigosExistentes.has(c.codigo));
      // CNAEs to update type if changed
      const cnaesAtualizar = cnaesExtraidos.filter((c) => {
        const existente = cnaesExistentes.find((e) => e.codigo === c.codigo);
        return existente && existente.tipo !== c.tipo;
      });

      // Remove old CNAEs
      if (cnaesRemover.length > 0) {
        const { error } = await supabase
          .from("cnaes_fornecedor")
          .delete()
          .eq("fornecedor_id", fornecedorId)
          .in("codigo_cnae", cnaesRemover.map((c) => c.codigo));
        if (error) throw error;
      }

      // Add new CNAEs
      if (cnaesAdicionar.length > 0) {
        const { error } = await supabase.from("cnaes_fornecedor").insert(
          cnaesAdicionar.map((c) => ({
            fornecedor_id: fornecedorId,
            codigo_cnae: c.codigo,
            descricao: c.descricao,
            tipo: c.tipo,
          }))
        );
        if (error) throw error;
      }

      // Update changed types
      for (const cnae of cnaesAtualizar) {
        const { error } = await supabase
          .from("cnaes_fornecedor")
          .update({ tipo: cnae.tipo, descricao: cnae.descricao, updated_at: new Date().toISOString() })
          .eq("fornecedor_id", fornecedorId)
          .eq("codigo_cnae", cnae.codigo);
        if (error) throw error;
      }

      setCnaesExistentes(cnaesExtraidos);
      setCnaesSalvos(true);

      const msgs: string[] = [];
      if (cnaesAdicionar.length > 0) msgs.push(`${cnaesAdicionar.length} adicionado(s)`);
      if (cnaesRemover.length > 0) msgs.push(`${cnaesRemover.length} removido(s)`);
      if (cnaesAtualizar.length > 0) msgs.push(`${cnaesAtualizar.length} atualizado(s)`);
      if (msgs.length === 0) msgs.push("Nenhuma alteração necessária");
      
      toast.success(`CNAEs atualizados: ${msgs.join(", ")}`);
    } catch (error: any) {
      console.error("Erro ao salvar CNAEs:", error);
      toast.error(error.message || "Erro ao salvar CNAEs");
    }
  };

  const handleEnviarAnalise = async () => {
    if (!avaliacao) return;

    if (!scoreRiscoTotal || !classificacaoRisco) {
      toast.error("Preencha o Score de Risco e a Classificação de Risco");
      return;
    }

    setProcessando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Upload do relatório KPMG se houver
      let urlRelatorioKPMG = null;
      if (relatorioKPMG) {
        // Verificar se já existe relatório KPMG anterior e deletá-lo
        const { data: relatorioAnterior } = await supabase
          .from("documentos_fornecedor")
          .select("id, url_arquivo")
          .eq("fornecedor_id", avaliacao.fornecedor_id)
          .eq("tipo_documento", "relatorio_kpmg_compliance")
          .maybeSingle();

        if (relatorioAnterior) {
          // Extrair path do storage da URL anterior
          const urlAnterior = relatorioAnterior.url_arquivo;
          const pathMatch = urlAnterior.match(/processo-anexos\/(.+)$/);
          if (pathMatch) {
            const pathAnterior = pathMatch[1];
            // Deletar arquivo anterior do storage
            await supabase.storage
              .from("processo-anexos")
              .remove([pathAnterior]);
          }

          // Deletar registro anterior do banco
          await supabase
            .from("documentos_fornecedor")
            .delete()
            .eq("id", relatorioAnterior.id);
        }

        // Upload do novo relatório com path organizado por fornecedor
        const fileName = `fornecedor_${avaliacao.fornecedor_id}/relatorio_kpmg_${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("processo-anexos")
          .upload(fileName, relatorioKPMG);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("processo-anexos")
          .getPublicUrl(fileName);

        urlRelatorioKPMG = publicUrl;

        // Salvar novo documento na tabela de documentos do fornecedor
        await supabase.from("documentos_fornecedor").insert({
          fornecedor_id: avaliacao.fornecedor_id,
          tipo_documento: "relatorio_kpmg_compliance",
          nome_arquivo: relatorioKPMG.name,
          url_arquivo: urlRelatorioKPMG,
          em_vigor: true
        });
      }

      // Atualizar avaliação
      const { error: updateError } = await supabase
        .from("avaliacoes_cadastro_fornecedor")
        .update({
          status_avaliacao: "respondido",
          score_risco_total: parseInt(scoreRiscoTotal),
          classificacao_risco: classificacaoRisco,
          observacoes_compliance: observacoesCompliance,
          usuario_compliance_id: user.id,
          data_resposta: new Date().toISOString(),
        })
        .eq("id", avaliacao.id);

      if (updateError) throw updateError;

      toast.success("Análise de compliance enviada com sucesso!");
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Erro ao enviar análise:", error);
      toast.error(error.message || "Erro ao enviar análise");
    } finally {
      setProcessando(false);
    }
  };

  const getClassificacaoLabel = (classificacao: string) => {
    switch (classificacao) {
      case "satisfatorio":
        return "Satisfatório (Baixo Risco)";
      case "medio":
        return "Médio Risco";
      case "nao_satisfatorio":
        return "Não Satisfatório (Alto Risco)";
      default:
        return classificacao;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Análise de Due Diligence e Risco</DialogTitle>
          <DialogDescription>
            {fornecedor?.razao_social} - {fornecedor?.cnpj}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {/* Dados do Fornecedor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Dados do Fornecedor</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Razão Social</p>
                  <p className="font-medium">{fornecedor?.razao_social}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">CNPJ</p>
                  <p className="font-medium">{fornecedor?.cnpj}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">E-mail</p>
                  <p className="font-medium">{fornecedor?.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Telefone</p>
                  <p className="font-medium">{fornecedor?.telefone}</p>
                </div>
              </CardContent>
            </Card>

            {/* Documentos do Fornecedor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Documentos do Fornecedor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {documentosFornecedor.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url_arquivo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 border rounded hover:bg-muted/50 transition-colors text-sm"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{doc.tipo_documento}</p>
                        {doc.data_validade && (
                          <p className="text-xs text-muted-foreground">
                            Validade: {doc.data_validade.split('T')[0].split('-').reverse().join('/')}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Respostas Due Diligence */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Respostas do Questionário Due Diligence</span>
                  <Badge variant={scoreTotal === 0 ? "default" : "destructive"}>
                    Score: {scoreTotal}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {respostasDueDiligence.map((resposta: any) => (
                    <div key={resposta.id} className="p-2 border rounded text-sm">
                      <p className="font-medium">{resposta.perguntas_due_diligence?.texto_pergunta}</p>
                      <div className="flex justify-between items-center mt-1">
                        <span className={resposta.resposta_texto === "SIM" ? "text-green-600" : "text-red-600"}>
                          {resposta.resposta_texto}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {resposta.resposta_texto === "SIM"
                            ? resposta.perguntas_due_diligence?.pontuacao_sim
                            : resposta.perguntas_due_diligence?.pontuacao_nao} pts
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Formulário de Análise */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Análise de Risco</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="relatorio_kpmg">Relatório da KPMG (opcional)</Label>
                  {!relatorioKPMG ? (
                    <Input
                      id="relatorio_kpmg"
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setRelatorioKPMG(e.target.files?.[0] || null)}
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 border rounded bg-muted/50">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm flex-1 truncate">{relatorioKPMG.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRelatorioKPMG(null)}
                        className="h-8 w-8 p-0"
                      >
                        <span className="sr-only">Remover arquivo</span>
                        ✕
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="score_risco">Score Total de Risco *</Label>
                    <Input
                      id="score_risco"
                      type="number"
                      value={scoreRiscoTotal}
                      onChange={(e) => setScoreRiscoTotal(e.target.value)}
                      placeholder="Ex: 0, 50, 100, 200"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="classificacao">Classificação de Risco *</Label>
                    <Select value={classificacaoRisco} onValueChange={setClassificacaoRisco}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="satisfatorio">Satisfatório (Baixo Risco)</SelectItem>
                        <SelectItem value="medio">Médio Risco</SelectItem>
                        <SelectItem value="nao_satisfatorio">Não Satisfatório (Alto Risco)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observacoes">Observações do Compliance</Label>
                  <Textarea
                    id="observacoes"
                    value={observacoesCompliance}
                    onChange={(e) => setObservacoesCompliance(e.target.value)}
                    rows={4}
                    placeholder="Adicione observações sobre a análise de risco..."
                  />
                </div>

                {/* Extração de CNAEs do Cartão CNPJ */}
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-sm font-semibold">CNAEs / Atividades Econômicas</Label>
                  <p className="text-xs text-muted-foreground">
                    Faça upload do Comprovante de Inscrição e de Situação Cadastral (Cartão CNPJ) para extrair automaticamente os CNAEs do fornecedor. O arquivo é usado apenas para leitura e não será salvo no sistema.
                  </p>

                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept=".pdf"
                      disabled={extraindoCnaes}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadCartaoCNPJ(file);
                        e.target.value = "";
                      }}
                      className="cursor-pointer"
                    />
                    {extraindoCnaes && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extraindo CNAEs...
                      </div>
                    )}
                  </div>

                  {/* CNAEs Existentes */}
                  {cnaesExistentes.length > 0 && cnaesExtraidos.length === 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">CNAEs cadastrados atualmente:</p>
                      <ScrollArea className="max-h-40">
                        <div className="space-y-1">
                          {cnaesExistentes.filter(c => c.tipo === "primaria").map((cnae) => (
                            <div key={cnae.codigo} className="flex items-center gap-2 p-2 border rounded text-xs bg-primary/5">
                              <Badge variant="default" className="text-[10px] shrink-0">Principal</Badge>
                              <span className="font-mono shrink-0">{cnae.codigo}</span>
                              <span className="truncate">{cnae.descricao}</span>
                            </div>
                          ))}
                          {cnaesExistentes.filter(c => c.tipo === "secundaria").map((cnae) => (
                            <div key={cnae.codigo} className="flex items-center gap-2 p-2 border rounded text-xs">
                              <Badge variant="outline" className="text-[10px] shrink-0">Secundária</Badge>
                              <span className="font-mono shrink-0">{cnae.codigo}</span>
                              <span className="truncate">{cnae.descricao}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  {/* CNAEs Extraídos */}
                  {cnaesExtraidos.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">
                          {cnaesExtraidos.length} CNAE(s) extraído(s) do documento:
                        </p>
                        {!cnaesSalvos ? (
                          <Button size="sm" variant="default" onClick={handleSalvarCnaes}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Salvar CNAEs
                          </Button>
                        ) : (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Salvo
                          </Badge>
                        )}
                      </div>
                      <ScrollArea className="max-h-48">
                        <div className="space-y-1">
                          {cnaesExtraidos.filter(c => c.tipo === "primaria").map((cnae) => {
                            const isNovo = !cnaesExistentes.find(e => e.codigo === cnae.codigo);
                            return (
                              <div key={cnae.codigo} className={`flex items-center gap-2 p-2 border rounded text-xs ${isNovo ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : ""}`}>
                                <Badge variant="default" className="text-[10px] shrink-0">Principal</Badge>
                                <span className="font-mono shrink-0">{cnae.codigo}</span>
                                <span className="truncate flex-1">{cnae.descricao}</span>
                                {isNovo && <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 shrink-0">Novo</Badge>}
                              </div>
                            );
                          })}
                          {cnaesExtraidos.filter(c => c.tipo === "secundaria").map((cnae) => {
                            const isNovo = !cnaesExistentes.find(e => e.codigo === cnae.codigo);
                            return (
                              <div key={cnae.codigo} className={`flex items-center gap-2 p-2 border rounded text-xs ${isNovo ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : ""}`}>
                                <Badge variant="outline" className="text-[10px] shrink-0">Secundária</Badge>
                                <span className="font-mono shrink-0">{cnae.codigo}</span>
                                <span className="truncate flex-1">{cnae.descricao}</span>
                                {isNovo && <Badge variant="outline" className="text-[10px] text-green-600 border-green-300 shrink-0">Novo</Badge>}
                              </div>
                            );
                          })}
                          {/* Show removed CNAEs */}
                          {cnaesExistentes.filter(e => !cnaesExtraidos.find(c => c.codigo === e.codigo)).map((cnae) => (
                            <div key={cnae.codigo} className="flex items-center gap-2 p-2 border rounded text-xs bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800 line-through opacity-60">
                              <Badge variant="outline" className="text-[10px] shrink-0">{cnae.tipo === "primaria" ? "Principal" : "Secundária"}</Badge>
                              <span className="font-mono shrink-0">{cnae.codigo}</span>
                              <span className="truncate flex-1">{cnae.descricao}</span>
                              <Badge variant="outline" className="text-[10px] text-red-600 border-red-300 shrink-0">Removido</Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processando}>
            Cancelar
          </Button>
          <Button onClick={handleEnviarAnalise} disabled={processando || loading}>
            {processando ? "Enviando..." : "Enviar Análise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
