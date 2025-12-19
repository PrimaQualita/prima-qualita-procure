import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validarCPF, mascaraCPF } from "@/lib/validators";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

interface Usuario {
  id: string;
  nome_completo: string;
  email: string;
  cpf: string;
  data_nascimento?: string;
  ativo: boolean;
  role?: string;
  responsavel_legal?: boolean;
  compliance?: boolean;
  cargo?: string;
  gerente_contratos?: boolean;
  superintendente_executivo?: boolean;
  // legado (não usar mais)
  gerente_financeiro?: boolean;
}

interface ContratoGestao {
  id: string;
  nome_contrato: string;
  ente_federativo: string;
}

interface DialogUsuarioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  usuarioEdit?: Usuario | null;
}

export function DialogUsuario({ open, onOpenChange, onSuccess, usuarioEdit }: DialogUsuarioProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [role, setRole] = useState<"gestor" | "colaborador">("colaborador");
  const [responsavelLegal, setResponsavelLegal] = useState(false);
  const [compliance, setCompliance] = useState(false);
  const [cargo, setCargo] = useState("");
  const [isUserResponsavelLegal, setIsUserResponsavelLegal] = useState(false);
  const [isUserGestor, setIsUserGestor] = useState(false);
  
  // Perfis adicionais
  const [gerenteContratos, setGerenteContratos] = useState(false);
  const [superintendenteExecutivo, setSuperintendenteExecutivo] = useState(false);
  const [contratosDisponiveis, setContratosDisponiveis] = useState<ContratoGestao[]>([]);
  const [contratosSelecionados, setContratosSelecionados] = useState<string[]>([]);

  // Verificar se o usuário logado é responsável legal e gestor
  useEffect(() => {
    const checkUserPermissions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        onOpenChange(false);
        return;
      }

      // Verificar se é gestor
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "gestor")
        .maybeSingle();

      if (!roleData) {
        toast({
          title: "Acesso negado",
          description: "Apenas gestores podem criar ou editar usuários.",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }

      setIsUserGestor(true);

      // Verificar se é responsável legal
      const { data: profile } = await supabase
        .from("profiles")
        .select("responsavel_legal")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setIsUserResponsavelLegal(profile.responsavel_legal === true);
      }

      // Carregar contratos de gestão disponíveis
      const { data: contratos } = await supabase
        .from("contratos_gestao")
        .select("id, nome_contrato, ente_federativo")
        .eq("status", "ativo")
        .order("nome_contrato");

      if (contratos) {
        setContratosDisponiveis(contratos);
      }
    };

    if (open) {
      checkUserPermissions();
    }
  }, [open]);

  // Carregar dados do usuário quando for edição
  useEffect(() => {
    const loadUserData = async () => {
      if (usuarioEdit) {
        setNomeCompleto(usuarioEdit.nome_completo);
        setEmail(usuarioEdit.email);
        setCpf(mascaraCPF(usuarioEdit.cpf));
        setDataNascimento(usuarioEdit.data_nascimento || "");
        const roleEdit = usuarioEdit.role;
        const normalizedRole: "gestor" | "colaborador" =
          roleEdit === "gestor" || roleEdit === "colaborador" ? roleEdit : "colaborador";
        setRole(normalizedRole);
        setResponsavelLegal(usuarioEdit.responsavel_legal || false);
        setCompliance((usuarioEdit as any).compliance || false);
        setCargo((usuarioEdit as any).cargo || "");
        setGerenteContratos((usuarioEdit as any).gerente_contratos || false);
        setSuperintendenteExecutivo(
          (usuarioEdit as any).superintendente_executivo || (usuarioEdit as any).gerente_financeiro || false
        );

        // Carregar contratos vinculados ao gerente
        if ((usuarioEdit as any).gerente_contratos) {
          const { data: contratosVinculados } = await supabase
            .from("gerentes_contratos_gestao")
            .select("contrato_gestao_id")
            .eq("usuario_id", usuarioEdit.id);

          if (contratosVinculados) {
            setContratosSelecionados(contratosVinculados.map(c => c.contrato_gestao_id));
          }
        }
      } else {
        resetForm();
      }
    };

    loadUserData();
  }, [usuarioEdit, open]);

  const resetForm = () => {
    setNomeCompleto("");
    setEmail("");
    setCpf("");
    setDataNascimento("");
    setRole("colaborador");
    setResponsavelLegal(false);
    setCompliance(false);
    setCargo("");
    setGerenteContratos(false);
    setSuperintendenteExecutivo(false);
    setContratosSelecionados([]);
  };

  const handleContratoToggle = (contratoId: string) => {
    setContratosSelecionados(prev => 
      prev.includes(contratoId)
        ? prev.filter(id => id !== contratoId)
        : [...prev, contratoId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Verificar novamente se é gestor antes de salvar
    if (!isUserGestor) {
      toast({
        title: "Acesso negado",
        description: "Apenas gestores podem criar ou editar usuários.",
        variant: "destructive",
      });
      onOpenChange(false);
      return;
    }

    if (!validarCPF(cpf)) {
      toast({
        title: "CPF inválido",
        description: "Por favor, informe um CPF válido.",
        variant: "destructive",
      });
      return;
    }

    if (!dataNascimento) {
      toast({
        title: "Data de nascimento obrigatória",
        description: "A data de nascimento será usada como senha temporária.",
        variant: "destructive",
      });
      return;
    }

    // Validar que gerente de contratos tem pelo menos um contrato selecionado
    if (gerenteContratos && contratosSelecionados.length === 0) {
      toast({
        title: "Selecione ao menos um contrato",
        description: "O Gerente de Contratos precisa ter pelo menos um Contrato de Gestão vinculado.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (usuarioEdit) {
        // Modo edição - atualizar usuário existente
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            nome_completo: nomeCompleto,
            cpf: cpf.replace(/\D/g, ""),
            data_nascimento: dataNascimento,
            responsavel_legal: responsavelLegal,
            compliance: compliance,
            cargo: cargo || null,
            gerente_contratos: gerenteContratos,
            superintendente_executivo: superintendenteExecutivo,
          })
          .eq("id", usuarioEdit.id);

        if (profileError) throw profileError;

        // Mantém o comportamento existente: "Gerente de Contratos" pode ser um usuário externo (sem role interna)
        // Apenas quando NÃO acumula outros perfis internos.
        const isApenasGerenteExterno =
          gerenteContratos &&
          role === "colaborador" &&
          !responsavelLegal &&
          !compliance &&
          !superintendenteExecutivo;

        // Deletar roles atuais
        await supabase.from("user_roles").delete().eq("user_id", usuarioEdit.id);

        // Inserir role (gestor/colaborador) somente se NÃO for apenas gerente externo
        if (!isApenasGerenteExterno) {
          await supabase.from("user_roles").insert({
            user_id: usuarioEdit.id,
            role,
          });
        }

        // Atualizar contratos vinculados ao gerente
        // Primeiro deletar todos os vínculos existentes
        await supabase
          .from("gerentes_contratos_gestao")
          .delete()
          .eq("usuario_id", usuarioEdit.id);

        // Se for gerente de contratos, inserir os novos vínculos
        if (gerenteContratos && contratosSelecionados.length > 0) {
          const vinculos = contratosSelecionados.map(contratoId => ({
            usuario_id: usuarioEdit.id,
            contrato_gestao_id: contratoId,
          }));

          const { error: vinculoError } = await supabase
            .from("gerentes_contratos_gestao")
            .insert(vinculos);

          if (vinculoError) throw vinculoError;
        }

        toast({
          title: "Usuário atualizado com sucesso!",
          description: `${nomeCompleto} foi atualizado.`,
        });
      } else {
        // Modo criação - criar novo usuário
        // Verificar se CPF ou email já existem
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("email, cpf")
          .or(`email.eq.${email},cpf.eq.${cpf}`)
          .maybeSingle();

        if (existingProfile) {
          toast({
            title: "Usuário já cadastrado",
            description: `Já existe um cadastro com este ${
              existingProfile.email === email ? "e-mail" : "CPF"
            }.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Gerar senha temporária a partir da data de nascimento (formato: ddmmaaaa)
        const [ano, mes, dia] = dataNascimento.split("-");
        const senhaTemporaria = `${dia}${mes}${ano}`;

        // Determinar se deve enviar role (apenas para gestores/colaboradores internos)
        const isApenasGerenteExterno =
          gerenteContratos &&
          role === "colaborador" &&
          !responsavelLegal &&
          !compliance &&
          !superintendenteExecutivo;
        const roleParaEnviar = isApenasGerenteExterno ? undefined : role;

        // Chamar edge function para criar usuário via Admin API
        const { data: functionData, error: functionError } = await supabase.functions.invoke(
          "criar-usuario-admin",
          {
            body: {
              email,
              password: senhaTemporaria,
              nomeCompleto,
              cpf,
              dataNascimento,
              role: roleParaEnviar,
              responsavelLegal,
              compliance,
              cargo,
              gerenteContratos,
              superintendenteExecutivo,
              contratosVinculados: gerenteContratos ? contratosSelecionados : [],
            },
          }
        );

        if (functionError) throw functionError;

        if (functionData?.error) {
          throw new Error(functionData.error);
        }

        const tipoUsuario = isApenasGerenteExterno ? 'gerente de contratos' : role;
        toast({
          title: "Usuário criado com sucesso!",
          description: `${nomeCompleto} foi cadastrado como ${tipoUsuario}. A senha temporária é a data de nascimento (${senhaTemporaria}).`,
        });
      }

      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar usuário:", error);
      toast({
        title: usuarioEdit ? "Erro ao atualizar usuário" : "Erro ao criar usuário",
        description: error.message || "Ocorreu um erro ao salvar o usuário.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{usuarioEdit ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          <DialogDescription>
            {usuarioEdit 
              ? "Edite as informações do usuário no sistema."
              : "Cadastre um novo gestor ou colaborador no sistema. A senha temporária será a data de nascimento."
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo *</Label>
              <Input
                id="nome"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Nome completo do usuário"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@email.com"
                required
                disabled={!!usuarioEdit}
              />
              {usuarioEdit && (
                <p className="text-xs text-muted-foreground">
                  O e-mail não pode ser alterado após criação
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF *</Label>
              <Input
                id="cpf"
                value={cpf}
                onChange={(e) => setCpf(mascaraCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="data-nascimento">Data de Nascimento *</Label>
              <Input
                id="data-nascimento"
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Será usada como senha temporária (formato: ddmmaaaa)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cargo">Cargo</Label>
              <Input
                id="cargo"
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                placeholder="Ex: Gerente de Compras, Analista, etc."
              />
              <p className="text-xs text-muted-foreground">
                O cargo será exibido nas assinaturas digitais
              </p>
            </div>

            <div className="space-y-2">
              <Label>Perfil *</Label>
              <RadioGroup value={role} onValueChange={(value) => setRole(value as "gestor" | "colaborador")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="colaborador" id="colaborador" />
                  <Label htmlFor="colaborador" className="font-normal cursor-pointer">
                    Colaborador
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="gestor" id="gestor" />
                  <Label htmlFor="gestor" className="font-normal cursor-pointer">
                    Gestor
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="responsavel-legal"
                checked={responsavelLegal}
                onChange={(e) => setResponsavelLegal(e.target.checked)}
                disabled={!isUserResponsavelLegal && !isUserGestor}
                className="h-4 w-4 rounded-full border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed accent-primary"
              />
              <Label 
                htmlFor="responsavel-legal" 
                className={`font-normal ${(isUserResponsavelLegal || isUserGestor) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              >
                Responsável Legal
              </Label>
            </div>
            {!isUserResponsavelLegal && !isUserGestor && (
              <p className="text-xs text-muted-foreground ml-6">
                Apenas Gestores e Responsáveis Legais podem alterar esta permissão
              </p>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="compliance"
                checked={compliance}
                onChange={(e) => setCompliance(e.target.checked)}
                disabled={!isUserResponsavelLegal && !isUserGestor}
                className="h-4 w-4 rounded-full border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed accent-primary"
              />
              <Label 
                htmlFor="compliance" 
                className={`font-normal ${(isUserResponsavelLegal || isUserGestor) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              >
                Compliance
              </Label>
            </div>
            {!isUserResponsavelLegal && !isUserGestor && (
              <p className="text-xs text-muted-foreground ml-6">
                Apenas Gestores e Responsáveis Legais podem alterar esta permissão
              </p>
            )}

            {/* Gerente de Contratos */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="gerente-contratos"
                  checked={gerenteContratos}
                  onChange={(e) => {
                    setGerenteContratos(e.target.checked);
                    if (!e.target.checked) {
                      setContratosSelecionados([]);
                    }
                  }}
                  disabled={!isUserResponsavelLegal && !isUserGestor}
                  className="h-4 w-4 rounded-full border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed accent-primary"
                />
                <Label 
                  htmlFor="gerente-contratos" 
                  className={`font-normal ${(isUserResponsavelLegal || isUserGestor) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                >
                  Gerente de Contratos
                </Label>
              </div>
              
              {/* Lista de contratos quando Gerente de Contratos estiver marcado */}
              {gerenteContratos && contratosDisponiveis.length > 0 && (
                <div className="ml-6 mt-2 space-y-2 p-3 border rounded-md bg-muted/50">
                  <p className="text-xs text-muted-foreground font-medium">
                    Selecione os Contratos de Gestão que este usuário gerencia:
                  </p>
                  {contratosDisponiveis.map((contrato) => (
                    <div key={contrato.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`contrato-${contrato.id}`}
                        checked={contratosSelecionados.includes(contrato.id)}
                        onChange={() => handleContratoToggle(contrato.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label 
                        htmlFor={`contrato-${contrato.id}`} 
                        className="font-normal cursor-pointer text-sm"
                      >
                        {contrato.nome_contrato} - {contrato.ente_federativo}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
              
              {gerenteContratos && contratosDisponiveis.length === 0 && (
                <p className="text-xs text-destructive ml-6">
                  Nenhum contrato de gestão ativo encontrado
                </p>
              )}
            </div>

            {/* Superintendente Executivo */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="superintendente-executivo"
                checked={superintendenteExecutivo}
                onChange={(e) => setSuperintendenteExecutivo(e.target.checked)}
                disabled={!isUserResponsavelLegal && !isUserGestor}
                className="h-4 w-4 rounded-full border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed accent-primary"
              />
              <Label
                htmlFor="superintendente-executivo"
                className={`font-normal ${(isUserResponsavelLegal || isUserGestor) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              >
                Superintendente Executivo
              </Label>
            </div>

          </div>


          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading 
                ? (usuarioEdit ? "Salvando..." : "Cadastrando...") 
                : (usuarioEdit ? "Salvar Alterações" : "Cadastrar Usuário")
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
