import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { validarCNPJ, mascaraCNPJ } from "@/lib/validators";

interface Fornecedor {
  id?: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj: string;
  endereco_comercial?: string;
  telefone: string;
  email: string;
  ativo?: boolean;
}

interface DueDiligencePergunta {
  id: string;
  texto_pergunta: string;
}

interface DocumentoUpload {
  tipo: string;
  arquivo: File | null;
  dataValidade: string;
  processando: boolean;
}

interface DialogFornecedorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fornecedor: Fornecedor | null;
  onSave: (fornecedor: Omit<Fornecedor, "id">) => Promise<void>;
}

export function DialogFornecedor({
  open,
  onOpenChange,
  fornecedor,
  onSave,
}: DialogFornecedorProps) {
  const [loading, setLoading] = useState(false);
  const [perguntas, setPerguntas] = useState<DueDiligencePergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, boolean>>({});
  const [documentos, setDocumentos] = useState<Record<string, DocumentoUpload>>({
    cnd_federal: { tipo: "CND Federal", arquivo: null, dataValidade: "", processando: false },
    cnd_tributos_estaduais: { tipo: "CND Tributos Estaduais", arquivo: null, dataValidade: "", processando: false },
    cnd_divida_ativa_estadual: { tipo: "CND Dívida Ativa Estadual", arquivo: null, dataValidade: "", processando: false },
    cnd_tributos_municipais: { tipo: "CND Tributos Municipais", arquivo: null, dataValidade: "", processando: false },
    cnd_divida_ativa_municipal: { tipo: "CND Dívida Ativa Municipal", arquivo: null, dataValidade: "", processando: false },
    crf_fgts: { tipo: "CRF FGTS", arquivo: null, dataValidade: "", processando: false },
    cndt: { tipo: "CNDT", arquivo: null, dataValidade: "", processando: false },
    contrato_social: { tipo: "Contrato Social Consolidado", arquivo: null, dataValidade: "", processando: false },
    cartao_cnpj: { tipo: "Cartão CNPJ", arquivo: null, dataValidade: "", processando: false },
  });
  
  const [formData, setFormData] = useState<Omit<Fornecedor, "id">>({
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
    endereco_comercial: "",
    telefone: "",
    email: "",
    ativo: true,
  });

  useEffect(() => {
    if (open) {
      loadPerguntas();
    }
    
    if (fornecedor) {
      setFormData({
        razao_social: fornecedor.razao_social,
        nome_fantasia: fornecedor.nome_fantasia || "",
        cnpj: fornecedor.cnpj,
        endereco_comercial: fornecedor.endereco_comercial || "",
        telefone: fornecedor.telefone,
        email: fornecedor.email,
        ativo: fornecedor.ativo ?? true,
      });
      if (fornecedor.id) {
        loadRespostas(fornecedor.id);
        loadDocumentos(fornecedor.id);
      }
    } else {
      setFormData({
        razao_social: "",
        nome_fantasia: "",
        cnpj: "",
        endereco_comercial: "",
        telefone: "",
        email: "",
        ativo: true,
      });
      setRespostas({});
    }
  }, [fornecedor, open]);

  const loadPerguntas = async () => {
    try {
      // Internal users can access the full table; this component is only used by authenticated internal users
      const { data, error } = await supabase
        .from("perguntas_due_diligence")
        .select("id, texto_pergunta")
        .eq("ativo", true)
        .order("ordem");

      if (error) throw error;
      setPerguntas(data || []);
    } catch (error) {
      console.error("Erro ao carregar perguntas:", error);
    }
  };

  const loadRespostas = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("respostas_due_diligence_fornecedor")
        .select("pergunta_id, resposta_texto")
        .eq("fornecedor_id", fornecedorId);

      if (error) throw error;
      
      const respostasMap: Record<string, boolean> = {};
      data?.forEach(r => {
        respostasMap[r.pergunta_id] = r.resposta_texto === "SIM";
      });
      setRespostas(respostasMap);
    } catch (error) {
      console.error("Erro ao carregar respostas:", error);
    }
  };

  const loadDocumentos = async (fornecedorId: string) => {
    try {
      const { data, error } = await supabase
        .from("documentos_fornecedor")
        .select("*")
        .eq("fornecedor_id", fornecedorId);

      if (error) throw error;
      
      // Map loaded documents to state
      // This is just to show existing documents, actual implementation would need file download logic
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
    }
  };

  const handleFileUpload = async (tipoDoc: string, file: File) => {
    const temValidade = !["contrato_social", "cartao_cnpj"].includes(tipoDoc);
    
    setDocumentos(prev => ({
      ...prev,
      [tipoDoc]: { ...prev[tipoDoc], arquivo: file, processando: temValidade }
    }));

    if (temValidade) {
      try {
        // Convert file to base64
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64 = e.target?.result?.toString().split(',')[1];
          
          const { data, error } = await supabase.functions.invoke('extrair-data-pdf', {
            body: { pdfBase64: base64, tipoDocumento: tipoDoc }
          });

          if (error) throw error;

          setDocumentos(prev => ({
            ...prev,
            [tipoDoc]: { 
              ...prev[tipoDoc], 
              dataValidade: data.dataValidade || "", 
              processando: false 
            }
          }));

          if (data.dataValidade) {
            toast.success(`Data de validade extraída: ${new Date(data.dataValidade).toLocaleDateString()}`);
          } else {
            toast.warning("Não foi possível extrair a data de validade automaticamente");
          }
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Erro ao processar PDF:", error);
        toast.error("Erro ao processar PDF");
        setDocumentos(prev => ({
          ...prev,
          [tipoDoc]: { ...prev[tipoDoc], processando: false }
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate CNPJ
    if (!validarCNPJ(formData.cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }

    // Check if CNPJ already exists (only for new fornecedor)
    if (!fornecedor?.id) {
      const { data: existingFornecedor } = await supabase
        .from("fornecedores")
        .select("id")
        .eq("cnpj", formData.cnpj.replace(/\D/g, ''))
        .single();

      if (existingFornecedor) {
        toast.error("Já existe um fornecedor cadastrado com este CNPJ");
        return;
      }
    }

    setLoading(true);
    try {
      await onSave(formData);
      
      // Get the saved fornecedor ID
      let fornecedorId = fornecedor?.id;
      
      if (!fornecedorId) {
        // If new fornecedor, get the ID from the database
        const { data: newFornecedor } = await supabase
          .from("fornecedores")
          .select("id")
          .eq("cnpj", formData.cnpj.replace(/\D/g, ''))
          .single();
        
        fornecedorId = newFornecedor?.id;
      }

      if (fornecedorId) {
        // Save respostas due diligence
        for (const perguntaId in respostas) {
          const { error } = await supabase
            .from("respostas_due_diligence_fornecedor")
            .upsert({
              fornecedor_id: fornecedorId,
              pergunta_id: perguntaId,
              resposta_texto: respostas[perguntaId] ? "SIM" : "NÃO"
            });
          
          if (error) throw error;
        }

        // Upload documents
        for (const [key, doc] of Object.entries(documentos)) {
          if (doc.arquivo) {
            const fileName = `${fornecedorId}/${key}_${Date.now()}.pdf`;
            
            const { error: uploadError } = await supabase.storage
              .from("processo-anexos")
              .upload(fileName, doc.arquivo);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from("processo-anexos")
              .getPublicUrl(fileName);

            const { error: docError } = await supabase
              .from("documentos_fornecedor")
              .insert({
                fornecedor_id: fornecedorId,
                tipo_documento: key,
                nome_arquivo: doc.arquivo.name,
                url_arquivo: publicUrl,
                data_validade: doc.dataValidade || null,
                em_vigor: true
              });

            if (docError) throw docError;
          }
        }
      }

      toast.success("Fornecedor salvo com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar fornecedor:", error);
      toast.error(error.message || "Erro ao salvar fornecedor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {fornecedor ? "Editar Fornecedor" : "Novo Fornecedor"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados Básicos */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Dados Básicos</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="razao_social">Razão Social *</Label>
                <Input
                  id="razao_social"
                  value={formData.razao_social}
                  onChange={(e) =>
                    setFormData({ ...formData, razao_social: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
                <Input
                  id="nome_fantasia"
                  value={formData.nome_fantasia}
                  onChange={(e) =>
                    setFormData({ ...formData, nome_fantasia: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  value={formData.cnpj}
                  onChange={(e) =>
                    setFormData({ ...formData, cnpj: mascaraCNPJ(e.target.value) })
                  }
                  required
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone com DDD *</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) =>
                    setFormData({ ...formData, telefone: e.target.value })
                  }
                  required
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="endereco_comercial">Endereço Comercial *</Label>
                <Textarea
                  id="endereco_comercial"
                  value={formData.endereco_comercial}
                  onChange={(e) =>
                    setFormData({ ...formData, endereco_comercial: e.target.value })
                  }
                  required
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Perguntas Due Diligence */}
          {perguntas.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Questionário</h3>
              <div className="space-y-3">
                {perguntas.map((pergunta) => (
                  <div key={pergunta.id} className="flex items-center space-x-3 p-3 border rounded-md">
                    <Checkbox
                      id={pergunta.id}
                      checked={respostas[pergunta.id] || false}
                      onCheckedChange={(checked) =>
                        setRespostas({ ...respostas, [pergunta.id]: checked as boolean })
                      }
                    />
                    <Label htmlFor={pergunta.id} className="flex-1 cursor-pointer">
                      {pergunta.texto_pergunta}
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {respostas[pergunta.id] ? "SIM" : "NÃO"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentos */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Documentos</h3>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(documentos).map(([key, doc]) => (
                <div key={key} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{doc.tipo}</Label>
                    {doc.arquivo && (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="h-4 w-4" />
                        {doc.arquivo.name}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(key, file);
                        }}
                        className="cursor-pointer"
                      />
                    </div>
                    
                    {!["contrato_social", "cartao_cnpj"].includes(key) && (
                      <div className="space-y-1">
                        <Input
                          type="date"
                          value={doc.dataValidade}
                          onChange={(e) =>
                            setDocumentos({
                              ...documentos,
                              [key]: { ...doc, dataValidade: e.target.value }
                            })
                          }
                          placeholder="Data de Validade"
                          disabled={doc.processando}
                        />
                        {doc.processando && (
                          <p className="text-xs text-muted-foreground">Extraindo data...</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
