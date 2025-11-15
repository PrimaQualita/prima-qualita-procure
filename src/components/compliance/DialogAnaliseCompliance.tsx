// @ts-nocheck - Tabelas de compliance podem não existir no schema atual
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Save, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { gerarAnaliseCompliancePDF } from "@/lib/gerarAnaliseCompliancePDF";
import { formatarCNPJ } from "@/lib/validators";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface EmpresaAnalise {
  razao_social: string;
  cnpj: string;
  capital_social: string;
  ano_fundacao: string;
  contratos_ativos_oss: boolean;
  conflito_interesse: string;
  capacidade_tecnica: string;
  risco_financeiro: string;
  reputacao: string;
  cnae: string;
}

interface DialogAnaliseComplianceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processoId: string;
  cotacaoId: string;
  numeroProcesso: string;
  objetoDescricao: string;
  criterioJulgamento: string;
}

export function DialogAnaliseCompliance({
  open,
  onOpenChange,
  processoId,
  cotacaoId,
  numeroProcesso,
  objetoDescricao,
  criterioJulgamento,
}: DialogAnaliseComplianceProps) {
  const [empresas, setEmpresas] = useState<EmpresaAnalise[]>([
    {
      razao_social: "",
      cnpj: "",
      capital_social: "",
      ano_fundacao: "",
      contratos_ativos_oss: false,
      conflito_interesse: "",
      capacidade_tecnica: "",
      risco_financeiro: "",
      reputacao: "",
      cnae: "",
    },
  ]);
  
  const [consideracoesFinais, setConsideracoesFinais] = useState("");
  const [conclusao, setConclusao] = useState("");
  const [statusAprovacao, setStatusAprovacao] = useState<"aprovado" | "reprovado" | "pendente">("pendente");
  const [empresasReprovadas, setEmpresasReprovadas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [analiseId, setAnaliseId] = useState<string | null>(null);
  const [urlDocumento, setUrlDocumento] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      loadExistingAnalise();
    }
  }, [open, cotacaoId]);

  const loadFornecedoresPropostas = async () => {
    try {
      const { data: respostas, error } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          *,
          fornecedores (
            razao_social,
            cnpj
          )
        `)
        .eq("cotacao_id", cotacaoId);

      if (error) throw error;

      if (respostas && respostas.length > 0) {
        const empresasPreenchidas = respostas.map((resposta: any) => ({
          razao_social: resposta.fornecedores?.razao_social || "",
          cnpj: formatarCNPJ(resposta.fornecedores?.cnpj || ""),
          capital_social: "",
          ano_fundacao: "",
          contratos_ativos_oss: false,
          conflito_interesse: "",
          capacidade_tecnica: "",
          risco_financeiro: "",
          reputacao: "",
          cnae: "",
        }));
        
        setEmpresas(empresasPreenchidas);
      }
    } catch (error: any) {
      console.error("Erro ao carregar fornecedores:", error);
    }
  };

  const loadExistingAnalise = async () => {
    try {
      // @ts-ignore - Tabela analises_compliance pode não existir no schema
      const { data, error } = await supabase
        .from("analises_compliance")
        .select("*")
        .eq("cotacao_id", cotacaoId)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setAnaliseId(data.id);
        setEmpresas((data.empresas as any) || []);
        setConsideracoesFinais(data.consideracoes_finais || "");
        setConclusao(data.conclusao || "");
        setStatusAprovacao((data.status_aprovacao as any) || "pendente");
        setEmpresasReprovadas(data.empresas_reprovadas || []);
        setUrlDocumento(data.url_documento || null);
        setNomeArquivo(data.nome_arquivo || null);
      } else {
        // Só carrega fornecedores se não houver análise existente
        await loadFornecedoresPropostas();
      }
    } catch (error: any) {
      console.error("Erro ao carregar análise:", error);
    }
  };

  const adicionarEmpresa = () => {
    setEmpresas([
      ...empresas,
      {
        razao_social: "",
        cnpj: "",
        capital_social: "",
        ano_fundacao: "",
        contratos_ativos_oss: false,
        conflito_interesse: "",
        capacidade_tecnica: "",
        risco_financeiro: "",
        reputacao: "",
        cnae: "",
      },
    ]);
  };

  const removerEmpresa = (index: number) => {
    setEmpresas(empresas.filter((_, i) => i !== index));
  };

  const formatarMoeda = (valor: string) => {
    // Remove tudo que não é número
    const numero = valor.replace(/\D/g, "");
    
    // Converte para número e formata
    const valorNumerico = Number(numero) / 100;
    
    return valorNumerico.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  const formatarCriterioJulgamento = (criterio: string) => {
    const criterios: Record<string, string> = {
      "por_item": "Por Item",
      "global": "Global",
      "por_lote": "Por Lote"
    };
    
    return criterios[criterio.toLowerCase()] || criterio;
  };

  const atualizarEmpresa = (index: number, campo: keyof EmpresaAnalise, valor: any) => {
    const novasEmpresas = [...empresas];
    
    // Se for capital social, formata como moeda
    if (campo === "capital_social") {
      novasEmpresas[index] = { ...novasEmpresas[index], [campo]: formatarMoeda(valor) };
    } else {
      novasEmpresas[index] = { ...novasEmpresas[index], [campo]: valor };
    }
    
    setEmpresas(novasEmpresas);
  };

  const toggleEmpresaReprovada = (cnpj: string) => {
    if (empresasReprovadas.includes(cnpj)) {
      setEmpresasReprovadas(empresasReprovadas.filter((c) => c !== cnpj));
    } else {
      setEmpresasReprovadas([...empresasReprovadas, cnpj]);
    }
  };

  const salvarRascunho = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      const analiseData = {
        cotacao_id: cotacaoId,
        processo_numero: numeroProcesso,
        objeto_descricao: objetoDescricao,
        criterio_julgamento: criterioJulgamento,
        empresas: empresas as any,
        consideracoes_finais: consideracoesFinais,
        conclusao: conclusao,
        status_aprovacao: statusAprovacao,
        empresas_reprovadas: empresasReprovadas,
        usuario_analista_id: user?.id,
      };

      if (analiseId) {
        const { error } = await supabase
          .from("analises_compliance")
          .update(analiseData)
          .eq("id", analiseId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("analises_compliance")
          .insert(analiseData)
          .select()
          .single();

        if (error) throw error;
        setAnaliseId(data.id);
      }

      toast.success("Rascunho salvo com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar rascunho:", error);
      toast.error("Erro ao salvar rascunho");
    } finally {
      setLoading(false);
    }
  };

  const gerarDocumento = async () => {
    try {
      setLoading(true);
      
      // Validar campos obrigatórios
      if (empresas.some((e) => !e.razao_social || !e.cnpj)) {
        toast.error("Preencha todos os dados das empresas");
        return;
      }

      if (!consideracoesFinais || !conclusao) {
        toast.error("Preencha as considerações finais e conclusão");
        return;
      }

      // Salvar ou atualizar análise e obter o ID
      const { data: { user } } = await supabase.auth.getUser();
      
      const analiseData = {
        cotacao_id: cotacaoId,
        processo_numero: numeroProcesso,
        objeto_descricao: objetoDescricao,
        criterio_julgamento: criterioJulgamento,
        empresas: empresas as any,
        consideracoes_finais: consideracoesFinais,
        conclusao: conclusao,
        status_aprovacao: statusAprovacao,
        empresas_reprovadas: empresasReprovadas,
        usuario_analista_id: user?.id,
      };

      let idAnalise = analiseId;

      if (analiseId) {
        const { error } = await supabase
          .from("analises_compliance")
          .update(analiseData)
          .eq("id", analiseId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("analises_compliance")
          .insert(analiseData)
          .select()
          .single();

        if (error) throw error;
        idAnalise = data.id;
        setAnaliseId(data.id);
      }

      // Gerar PDF
      const resultado = await gerarAnaliseCompliancePDF({
        processo_numero: numeroProcesso,
        objeto_descricao: objetoDescricao,
        criterio_julgamento: criterioJulgamento,
        empresas: empresas,
        consideracoes_finais: consideracoesFinais,
        conclusao: conclusao,
      });

      // Atualizar análise com informações do documento usando o ID correto
      const { error: updateError } = await supabase
        .from("analises_compliance")
        .update({
          url_documento: resultado.url,
          nome_arquivo: resultado.filename,
          protocolo: resultado.protocolo,
        })
        .eq("id", idAnalise);

      if (updateError) throw updateError;

      // Atualizar estados locais com os dados do documento
      setUrlDocumento(resultado.url);
      setNomeArquivo(resultado.filename);

      toast.success("Documento gerado com sucesso!");
      
      // Recarregar análise
      await loadExistingAnalise();
    } catch (error: any) {
      console.error("Erro ao gerar documento:", error);
      toast.error("Erro ao gerar documento");
    } finally {
      setLoading(false);
    }
  };

  const finalizarAnalise = async () => {
    try {
      setLoading(true);

      if (statusAprovacao === "pendente") {
        toast.error("Selecione se a análise foi aprovada ou reprovada");
        return;
      }

      if (statusAprovacao === "reprovado" && empresasReprovadas.length === 0) {
        toast.error("Selecione pelo menos uma empresa reprovada");
        return;
      }

      // Atualizar status
      const { error } = await supabase
        .from("analises_compliance")
        .update({
          status_aprovacao: statusAprovacao,
          empresas_reprovadas: empresasReprovadas,
        })
        .eq("id", analiseId!);

      if (error) throw error;

      // Atualizar cotação como respondida
      const { error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .update({
          respondido_compliance: true,
          data_resposta_compliance: new Date().toISOString(),
        })
        .eq("id", cotacaoId);

      if (cotacaoError) throw cotacaoError;

      toast.success("Análise finalizada com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao finalizar análise:", error);
      toast.error("Erro ao finalizar análise");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Análise de Compliance</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações do Processo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações do Processo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Processo:</strong> {numeroProcesso}</p>
              <p><strong>Objeto:</strong> {objetoDescricao}</p>
              <p><strong>Critério de Julgamento:</strong> {formatarCriterioJulgamento(criterioJulgamento)}</p>
            </CardContent>
          </Card>

          {/* Empresas Analisadas */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Empresas Analisadas</h3>
              <Button onClick={adicionarEmpresa} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Empresa
              </Button>
            </div>

            {empresas.map((empresa, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Empresa {index + 1}</CardTitle>
                    {empresas.length > 1 && (
                      <Button
                        onClick={() => removerEmpresa(index)}
                        variant="ghost"
                        size="sm"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Razão Social *</Label>
                      <Input
                        value={empresa.razao_social}
                        onChange={(e) => atualizarEmpresa(index, "razao_social", e.target.value)}
                        placeholder="Nome da empresa"
                      />
                    </div>
                    <div>
                      <Label>CNPJ *</Label>
                      <Input
                        value={empresa.cnpj}
                        onChange={(e) => atualizarEmpresa(index, "cnpj", e.target.value)}
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <div>
                      <Label>Capital Social</Label>
                      <Input
                        value={empresa.capital_social}
                        onChange={(e) => atualizarEmpresa(index, "capital_social", e.target.value)}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div>
                      <Label>Ano de Fundação</Label>
                      <Input
                        value={empresa.ano_fundacao}
                        onChange={(e) => atualizarEmpresa(index, "ano_fundacao", e.target.value)}
                        placeholder="Ex: 2015"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`contratos-${index}`}
                      checked={empresa.contratos_ativos_oss}
                      onCheckedChange={(checked) =>
                        atualizarEmpresa(index, "contratos_ativos_oss", checked)
                      }
                    />
                    <Label htmlFor={`contratos-${index}`}>
                      Possui contratos ativos com a OSS
                    </Label>
                  </div>

                  <div>
                    <Label>Conflito de Interesse</Label>
                    <RichTextEditor
                      value={empresa.conflito_interesse}
                      onChange={(value) => atualizarEmpresa(index, "conflito_interesse", value)}
                      placeholder="Descreva análise sobre conflito de interesse..."
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <Label>Capacidade Técnica</Label>
                    <RichTextEditor
                      value={empresa.capacidade_tecnica}
                      onChange={(value) => atualizarEmpresa(index, "capacidade_tecnica", value)}
                      placeholder="Descreva análise sobre capacidade técnica..."
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <Label>Risco Financeiro</Label>
                    <RichTextEditor
                      value={empresa.risco_financeiro}
                      onChange={(value) => atualizarEmpresa(index, "risco_financeiro", value)}
                      placeholder="Descreva análise sobre risco financeiro..."
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <Label>Reputação</Label>
                    <RichTextEditor
                      value={empresa.reputacao}
                      onChange={(value) => atualizarEmpresa(index, "reputacao", value)}
                      placeholder="Descreva análise sobre reputação..."
                      className="min-h-[100px]"
                    />
                  </div>

                  <div>
                    <Label>CNAE</Label>
                    <RichTextEditor
                      value={empresa.cnae}
                      onChange={(value) => atualizarEmpresa(index, "cnae", value)}
                      placeholder="Descreva CNAEs..."
                      className="min-h-[80px]"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator />

          {/* Considerações Finais e Conclusão */}
          <div className="space-y-4">
            <div>
              <Label>Considerações Finais *</Label>
              <RichTextEditor
                value={consideracoesFinais}
                onChange={setConsideracoesFinais}
                placeholder="Digite as considerações finais da análise..."
                className="min-h-[150px]"
              />
            </div>

            <div>
              <Label>Conclusão *</Label>
              <RichTextEditor
                value={conclusao}
                onChange={setConclusao}
                placeholder="Digite a conclusão da análise..."
                className="min-h-[150px]"
              />
            </div>
          </div>

          <Separator />

          {/* Status de Aprovação */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status da Análise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={statusAprovacao} onValueChange={(v: any) => setStatusAprovacao(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="aprovado" id="aprovado" />
                  <Label htmlFor="aprovado">Aprovado</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="reprovado" id="reprovado" />
                  <Label htmlFor="reprovado">Reprovado</Label>
                </div>
              </RadioGroup>

              {statusAprovacao === "reprovado" && empresas.length > 0 && (
                <div className="space-y-2 mt-4">
                  <Label>Empresas Reprovadas</Label>
                  <div className="space-y-2">
                    {empresas.map((empresa, index) => (
                      empresa.cnpj && (
                        <div key={index} className="flex items-center space-x-2">
                          <Checkbox
                            id={`reprovado-${index}`}
                            checked={empresasReprovadas.includes(empresa.cnpj)}
                            onCheckedChange={() => toggleEmpresaReprovada(empresa.cnpj)}
                          />
                          <Label htmlFor={`reprovado-${index}`}>
                            {empresa.razao_social} - {empresa.cnpj}
                          </Label>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Visualização do Documento Gerado */}
          {urlDocumento && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                  <FileText className="h-5 w-5" />
                  Documento Gerado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-sm">{nomeArquivo}</p>
                      <p className="text-xs text-muted-foreground">Documento de Análise de Compliance</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(urlDocumento, "_blank")}
                    >
                      Visualizar PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={gerarDocumento}
                      disabled={loading}
                    >
                      Regerar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Apagar
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O documento foi gerado com sucesso. Você pode visualizá-lo, regerá-lo ou apagá-lo antes de finalizar e enviar a análise.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Ações */}
          <div className="flex gap-3 justify-end">
            <Button onClick={salvarRascunho} variant="outline" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Salvar Rascunho
            </Button>
            <Button onClick={gerarDocumento} variant="outline" disabled={loading}>
              <FileText className="h-4 w-4 mr-2" />
              Gerar Documento
            </Button>
            <Button onClick={finalizarAnalise} disabled={loading || !urlDocumento}>
              Finalizar e Enviar
            </Button>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Apagar documento"
        description="Deseja realmente apagar este documento?"
        confirmText="Apagar"
        cancelText="Cancelar"
        onConfirm={async () => {
          try {
            setLoading(true);
            // Apagar documento do storage
            const path = urlDocumento?.split('/processo-anexos/')[1];
            if (path) {
              await supabase.storage
                .from('processo-anexos')
                .remove([path]);
            }
            
            // Limpar campos da análise
            await supabase
              .from("analises_compliance")
              .update({
                url_documento: null,
                nome_arquivo: null,
                protocolo: null,
              })
              .eq("id", analiseId!);
            
            setUrlDocumento(null);
            setNomeArquivo(null);
            toast.success("Documento apagado com sucesso!");
          } catch (error) {
            console.error("Erro ao apagar documento:", error);
            toast.error("Erro ao apagar documento");
          } finally {
            setLoading(false);
            setShowDeleteConfirm(false);
          }
        }}
      />
    </>
  );
}
