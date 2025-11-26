import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FileText, Upload, ExternalLink } from "lucide-react";

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

  useEffect(() => {
    if (open && avaliacao) {
      loadDados();
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
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do fornecedor");
    } finally {
      setLoading(false);
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
        const fileName = `avaliacao_${avaliacao.id}/relatorio_kpmg_${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("processo-anexos")
          .upload(fileName, relatorioKPMG);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("processo-anexos")
          .getPublicUrl(fileName);

        urlRelatorioKPMG = publicUrl;

        // Salvar documento na tabela de documentos do fornecedor
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
                  <Input
                    id="relatorio_kpmg"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setRelatorioKPMG(e.target.files?.[0] || null)}
                  />
                  {relatorioKPMG && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {relatorioKPMG.name}
                    </p>
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
