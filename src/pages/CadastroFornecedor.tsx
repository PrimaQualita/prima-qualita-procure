import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { validarCNPJ, mascaraCNPJ } from "@/lib/validators";
import { FileText, Upload } from "lucide-react";
import primaLogo from "@/assets/prima-qualita-logo.png";

interface DueDiligencePergunta {
  id: string;
  texto_pergunta: string;
}

interface DocumentoUpload {
  tipo: string;
  label: string;
  arquivo: File | null;
  dataValidade: string;
  processando: boolean;
  obrigatorio: boolean;
}

export default function CadastroFornecedor() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [perguntas, setPerguntas] = useState<DueDiligencePergunta[]>([]);
  const [respostas, setRespostas] = useState<Record<string, boolean>>({});
  
  const [formData, setFormData] = useState({
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
    endereco_comercial: "",
    telefone: "",
    email: "",
    senha: "",
    confirmar_senha: "",
  });

  const [documentos, setDocumentos] = useState<Record<string, DocumentoUpload>>({
    cnd_federal: { tipo: "cnd_federal", label: "CND Federal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_tributos_estaduais: { tipo: "cnd_tributos_estaduais", label: "CND Tributos Estaduais", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_divida_ativa_estadual: { tipo: "cnd_divida_ativa_estadual", label: "CND Dívida Ativa Estadual", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_tributos_municipais: { tipo: "cnd_tributos_municipais", label: "CND Tributos Municipais", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cnd_divida_ativa_municipal: { tipo: "cnd_divida_ativa_municipal", label: "CND Dívida Ativa Municipal", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    crf_fgts: { tipo: "crf_fgts", label: "CRF FGTS", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cndt: { tipo: "cndt", label: "CNDT", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    contrato_social: { tipo: "contrato_social", label: "Contrato Social Consolidado", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
    cartao_cnpj: { tipo: "cartao_cnpj", label: "Cartão CNPJ", arquivo: null, dataValidade: "", processando: false, obrigatorio: true },
  });

  useEffect(() => {
    loadPerguntas();
  }, []);

  const loadPerguntas = async () => {
    try {
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

  const handleFileUpload = async (tipoDoc: string, file: File) => {
    const temValidade = !["contrato_social", "cartao_cnpj"].includes(tipoDoc);
    
    setDocumentos(prev => ({
      ...prev,
      [tipoDoc]: { ...prev[tipoDoc], arquivo: file, processando: temValidade }
    }));

    if (temValidade) {
      try {
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
            // Formatar data sem conversão para evitar problema de timezone
            const [year, month, day] = data.dataValidade.split('-');
            const dataFormatada = `${day}/${month}/${year}`;
            toast.success(`Data de validade extraída: ${dataFormatada}`);
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
    
    // Validações
    if (!validarCNPJ(formData.cnpj)) {
      toast.error("CNPJ inválido");
      return;
    }

    if (formData.senha.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    if (formData.senha !== formData.confirmar_senha) {
      toast.error("As senhas não coincidem");
      return;
    }

    // Verificar se todos os documentos obrigatórios foram enviados
    const documentosFaltando = Object.entries(documentos)
      .filter(([_, doc]) => doc.obrigatorio && !doc.arquivo)
      .map(([_, doc]) => doc.label);

    if (documentosFaltando.length > 0) {
      toast.error(`Documentos obrigatórios faltando: ${documentosFaltando.join(", ")}`);
      return;
    }

    setLoading(true);
    try {
      // 1. Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.senha,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            tipo_usuario: 'fornecedor'
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Erro ao criar usuário");

      // 2. Criar registro de fornecedor
      const { data: fornecedorData, error: fornecedorError } = await supabase
        .from("fornecedores")
        .insert([{
          user_id: authData.user.id,
          razao_social: formData.razao_social,
          nome_fantasia: formData.nome_fantasia || null,
          cnpj: formData.cnpj.replace(/\D/g, ''),
          endereco_comercial: formData.endereco_comercial,
          telefone: formData.telefone,
          email: formData.email,
          status_aprovacao: 'pendente',
          ativo: false // Só fica ativo após aprovação do gestor
        }])
        .select()
        .single();

      if (fornecedorError) throw fornecedorError;

      // 3. Salvar respostas de due diligence
      if (Object.keys(respostas).length > 0) {
        const respostasArray = Object.entries(respostas).map(([perguntaId, valor]) => ({
          fornecedor_id: fornecedorData.id,
          pergunta_id: perguntaId,
          resposta_texto: valor ? "SIM" : "NÃO"
        }));

        const { error: respostasError } = await supabase
          .from("respostas_due_diligence_fornecedor")
          .insert(respostasArray);

        if (respostasError) throw respostasError;
      }

      // 4. Upload de documentos
      for (const [key, doc] of Object.entries(documentos)) {
        if (doc.arquivo) {
          const fileName = `fornecedor_${fornecedorData.id}/${key}_${Date.now()}.pdf`;
          
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
              fornecedor_id: fornecedorData.id,
              tipo_documento: key,
              nome_arquivo: doc.arquivo.name,
              url_arquivo: publicUrl,
              data_validade: doc.dataValidade || null,
              em_vigor: true
            });

          if (docError) throw docError;
        }
      }

      toast.success("Cadastro realizado com sucesso! Aguarde aprovação do gestor.");
      
      // Redirecionar para página de login
      setTimeout(() => {
        navigate("/auth");
      }, 2000);

    } catch (error: any) {
      console.error("Erro ao cadastrar fornecedor:", error);
      toast.error(error.message || "Erro ao realizar cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={primaLogo} alt="Prima Qualitá Saúde" className="h-16" />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Cadastro de Fornecedor</CardTitle>
            <CardDescription>
              Preencha todos os dados e envie os documentos necessários para análise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dados Básicos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Dados Básicos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="razao_social">Razão Social *</Label>
                    <Input
                      id="razao_social"
                      value={formData.razao_social}
                      onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
                    <Input
                      id="nome_fantasia"
                      value={formData.nome_fantasia}
                      onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ *</Label>
                    <Input
                      id="cnpj"
                      value={formData.cnpj}
                      onChange={(e) => setFormData({ ...formData, cnpj: mascaraCNPJ(e.target.value) })}
                      required
                      placeholder="00.000.000/0000-00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="telefone">Telefone com DDD *</Label>
                    <Input
                      id="telefone"
                      value={formData.telefone}
                      onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                      required
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email">E-mail *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="endereco_comercial">Endereço Comercial *</Label>
                    <Textarea
                      id="endereco_comercial"
                      value={formData.endereco_comercial}
                      onChange={(e) => setFormData({ ...formData, endereco_comercial: e.target.value })}
                      required
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senha">Senha *</Label>
                    <Input
                      id="senha"
                      type="password"
                      value={formData.senha}
                      onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmar_senha">Confirmar Senha *</Label>
                    <Input
                      id="confirmar_senha"
                      type="password"
                      value={formData.confirmar_senha}
                      onChange={(e) => setFormData({ ...formData, confirmar_senha: e.target.value })}
                      required
                      minLength={8}
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
                        <span className="text-sm font-medium">
                          {respostas[pergunta.id] ? "SIM" : "NÃO"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documentos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Documentos Obrigatórios</h3>
                <div className="grid grid-cols-1 gap-4">
                  {Object.entries(documentos).map(([key, doc]) => (
                    <div key={key} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">{doc.label} *</Label>
                      </div>
                      
                      {!doc.arquivo ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(key, file);
                              }}
                              required={doc.obrigatorio}
                              className="cursor-pointer"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                            <FileText className="h-5 w-5 text-primary" />
                            <span className="flex-1 text-sm font-medium">{doc.arquivo.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDocumentos({
                                  ...documentos,
                                  [key]: { ...doc, arquivo: null, dataValidade: "" }
                                });
                                toast.info("Documento removido");
                              }}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              ✕
                            </Button>
                          </div>
                          
                          {!["contrato_social", "cartao_cnpj"].includes(key) && (
                            <div className="space-y-1">
                              <Label className="text-sm text-muted-foreground">Data de Validade</Label>
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
                                required
                              />
                              {doc.processando && (
                                <p className="text-xs text-muted-foreground">Extraindo data automaticamente...</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? "Cadastrando..." : "Cadastrar Fornecedor"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}