import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CampoDocumento {
  id?: string;
  nome_campo: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
}

interface Fornecedor {
  id: string;
  razao_social: string;
}

interface DocumentoExistente {
  id: string;
  tipo_documento: string;
  nome_arquivo: string;
  data_validade: string | null;
  em_vigor: boolean;
}

interface DialogFinalizarProcessoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  onSuccess: () => void;
}

export function DialogFinalizarProcesso({
  open,
  onOpenChange,
  cotacaoId,
  onSuccess,
}: DialogFinalizarProcessoProps) {
  const [loading, setLoading] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<string>("");
  const [documentosExistentes, setDocumentosExistentes] = useState<DocumentoExistente[]>([]);
  const [campos, setCampos] = useState<CampoDocumento[]>([]);
  const [novoCampo, setNovoCampo] = useState<CampoDocumento>({
    nome_campo: "",
    descricao: "",
    obrigatorio: true,
    ordem: 0,
  });
  const [dataLimiteDocumentos, setDataLimiteDocumentos] = useState<string>("");

  useEffect(() => {
    if (open) {
      loadFornecedoresAprovados();
      loadCamposExistentes();
    }
  }, [open, cotacaoId]);

  useEffect(() => {
    if (fornecedorSelecionado) {
      loadDocumentosFornecedor(fornecedorSelecionado);
    } else {
      setDocumentosExistentes([]);
    }
  }, [fornecedorSelecionado]);

  const loadFornecedoresAprovados = async () => {
    const { data, error } = await supabase
      .from("fornecedores")
      .select("id, razao_social")
      .eq("status_aprovacao", "aprovado")
      .eq("ativo", true)
      .order("razao_social");

    if (error) {
      console.error("Erro ao carregar fornecedores:", error);
    } else {
      setFornecedores(data || []);
    }
  };

  const loadCamposExistentes = async () => {
    const { data, error } = await supabase
      .from("campos_documentos_finalizacao")
      .select("*")
      .eq("cotacao_id", cotacaoId)
      .order("ordem");

    if (error) {
      console.error("Erro ao carregar campos:", error);
    } else {
      setCampos(data || []);
    }
  };

  const loadDocumentosFornecedor = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("id, tipo_documento, nome_arquivo, data_validade, em_vigor")
        .eq("fornecedor_id", fornecedorId)
        .eq("em_vigor", true)
        .order("tipo_documento");

      if (error) throw error;

      setDocumentosExistentes(data || []);
    } catch (error) {
      console.error("Erro ao carregar documentos do fornecedor:", error);
      toast.error("Erro ao carregar documentos do fornecedor");
    }
  };

  const getTipoDocumentoLabel = (tipo: string): string => {
    const labels: Record<string, string> = {
      contrato_social: "Contrato Social",
      cartao_cnpj: "Cartão CNPJ",
      inscricao_estadual_municipal: "Inscrição Estadual/Municipal",
      certidao_negativa_debito_federal: "CND Federal",
      certidao_negativa_debito_estadual: "CND Tributos Estaduais",
      certidao_divida_ativa_estadual: "CND Dívida Ativa Estadual",
      certidao_negativa_debito_municipal: "CND Tributos Municipais",
      certidao_divida_ativa_municipal: "CND Dívida Ativa Municipal",
      fgts: "CRF FGTS",
      cndt: "CNDT",
      certificado_gestor: "Certificado de Fornecedor",
      relatorio_kpmg: "Relatório KPMG",
    };
    return labels[tipo] || tipo;
  };

  const adicionarCampo = () => {
    if (!novoCampo.nome_campo.trim()) {
      toast.error("Nome do campo é obrigatório");
      return;
    }

    const novaOrdem = campos.length > 0 ? Math.max(...campos.map(c => c.ordem)) + 1 : 1;
    setCampos([...campos, { ...novoCampo, ordem: novaOrdem }]);
    setNovoCampo({
      nome_campo: "",
      descricao: "",
      obrigatorio: true,
      ordem: 0,
    });
  };

  const removerCampo = (ordem: number) => {
    setCampos(campos.filter(c => c.ordem !== ordem));
  };

  const handleFinalizar = async () => {
    if (!fornecedorSelecionado) {
      toast.error("Selecione o fornecedor vencedor");
      return;
    }

    if (campos.length > 0 && !dataLimiteDocumentos) {
      toast.error("Informe a data limite para envio dos documentos");
      return;
    }

    setLoading(true);
    try {
      // Atualizar cotação com fornecedor vencedor e marcar como finalizada
      const { error: cotacaoError } = await supabase
        .from("cotacoes_precos")
        .update({
          fornecedor_vencedor_id: fornecedorSelecionado,
          processo_finalizado: true,
          data_finalizacao: new Date().toISOString(),
        })
        .eq("id", cotacaoId);

      if (cotacaoError) throw cotacaoError;

      // Inserir campos de documentos apenas se houver documentos faltantes
      if (campos.length > 0) {
        const camposParaInserir = campos.map(campo => ({
          cotacao_id: cotacaoId,
          nome_campo: campo.nome_campo,
          descricao: campo.descricao || `Data limite: ${new Date(dataLimiteDocumentos).toLocaleDateString('pt-BR')}`,
          obrigatorio: campo.obrigatorio,
          ordem: campo.ordem,
        }));

        const { error: camposError } = await supabase
          .from("campos_documentos_finalizacao")
          .insert(camposParaInserir);

        if (camposError) throw camposError;
      }

      toast.success(campos.length > 0 
        ? "Processo finalizado! Fornecedor será notificado sobre documentos pendentes."
        : "Processo finalizado com sucesso! Todos documentos já estão em ordem.");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao finalizar processo:", error);
      toast.error("Erro ao finalizar processo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Processo de Cotação</DialogTitle>
          <DialogDescription>
            Selecione o fornecedor vencedor, verifique os documentos e solicite apenas documentos faltantes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Seleção de Fornecedor */}
          <div className="grid gap-2">
            <Label htmlFor="fornecedor">Fornecedor Vencedor *</Label>
            <Select value={fornecedorSelecionado} onValueChange={setFornecedorSelecionado}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o fornecedor vencedor" />
              </SelectTrigger>
              <SelectContent>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Documentos Existentes do Fornecedor */}
          {fornecedorSelecionado && documentosExistentes.length > 0 && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                ✓ Documentos Válidos em Cadastro
              </h3>
              <div className="space-y-2">
                {documentosExistentes.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between text-sm p-2 bg-white dark:bg-background rounded">
                    <span className="font-medium">{getTipoDocumentoLabel(doc.tipo_documento)}</span>
                    <div className="flex items-center gap-2">
                      {doc.data_validade && (
                        <span className="text-muted-foreground">
                          Validade: {doc.data_validade.split('T')[0].split('-').reverse().join('/')}
                        </span>
                      )}
                      <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Em vigor
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                ℹ️ Estes documentos já estão válidos e não precisam ser solicitados novamente.
              </p>
            </div>
          )}

          {/* Mensagem quando todos documentos estão OK */}
          {fornecedorSelecionado && documentosExistentes.length > 0 && campos.length === 0 && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-950/20">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                ✅ Todos os documentos necessários estão em ordem! Você pode finalizar o processo diretamente ou adicionar campos para solicitar documentos complementares específicos.
              </p>
            </div>
          )}

          {/* Adicionar Novo Campo */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <h3 className="font-semibold mb-2">Solicitar Documentos Adicionais/Faltantes</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione apenas documentos que não constam no cadastro ou que precisam ser atualizados
            </p>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nome_campo">Nome do Documento *</Label>
                  <Input
                    id="nome_campo"
                    value={novoCampo.nome_campo}
                    onChange={(e) => setNovoCampo({ ...novoCampo, nome_campo: e.target.value })}
                    placeholder="Ex: Certidão Negativa Atualizada, Planilha de Custos..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="descricao">Descrição/Observações</Label>
                  <Input
                    id="descricao"
                    value={novoCampo.descricao}
                    onChange={(e) => setNovoCampo({ ...novoCampo, descricao: e.target.value })}
                    placeholder="Informações adicionais sobre o documento"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="obrigatorio"
                    checked={novoCampo.obrigatorio}
                    onCheckedChange={(checked) => 
                      setNovoCampo({ ...novoCampo, obrigatorio: checked as boolean })
                    }
                  />
                  <label htmlFor="obrigatorio" className="text-sm font-medium cursor-pointer">
                    Documento obrigatório
                  </label>
                </div>
                <Button type="button" onClick={adicionarCampo}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Campo
                </Button>
              </div>
            </div>
          </div>

          {/* Data Limite para Documentos */}
          {campos.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="data_limite">Data Limite para Envio dos Documentos *</Label>
              <Input
                id="data_limite"
                type="date"
                value={dataLimiteDocumentos}
                onChange={(e) => setDataLimiteDocumentos(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-sm text-muted-foreground">
                O fornecedor será notificado e terá até esta data para enviar os documentos solicitados
              </p>
            </div>
          )}

          {/* Lista de Campos Adicionados */}
          {campos.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Documentos que Serão Solicitados ao Fornecedor</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Nome do Documento</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-32">Obrigatório</TableHead>
                    <TableHead className="w-20 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campos.map((campo, index) => (
                    <TableRow key={campo.ordem}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{campo.nome_campo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {campo.descricao || "-"}
                      </TableCell>
                      <TableCell>
                        {campo.obrigatorio ? (
                          <span className="text-destructive font-medium">Sim</span>
                        ) : (
                          <span className="text-muted-foreground">Não</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removerCampo(campo.ordem)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleFinalizar} disabled={loading}>
            {loading ? "Finalizando..." : "Finalizar Processo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
