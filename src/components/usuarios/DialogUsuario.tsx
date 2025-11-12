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

  // Carregar dados do usuário quando for edição
  useEffect(() => {
    if (usuarioEdit) {
      setNomeCompleto(usuarioEdit.nome_completo);
      setEmail(usuarioEdit.email);
      setCpf(mascaraCPF(usuarioEdit.cpf));
      setDataNascimento(usuarioEdit.data_nascimento || "");
      setRole((usuarioEdit.role as "gestor" | "colaborador") || "colaborador");
      setResponsavelLegal(usuarioEdit.responsavel_legal || false);
    } else {
      resetForm();
    }
  }, [usuarioEdit, open]);

  const resetForm = () => {
    setNomeCompleto("");
    setEmail("");
    setCpf("");
    setDataNascimento("");
    setRole("colaborador");
    setResponsavelLegal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
          })
          .eq("id", usuarioEdit.id);

        if (profileError) throw profileError;

        // Atualizar role se necessário
        const { data: currentRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", usuarioEdit.id)
          .maybeSingle();

        if (currentRole?.role !== role) {
          // Deletar role atual
          await supabase
            .from("user_roles")
            .delete()
            .eq("user_id", usuarioEdit.id);

          // Inserir nova role
          await supabase
            .from("user_roles")
            .insert({
              user_id: usuarioEdit.id,
              role: role,
            });
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
              role,
              responsavelLegal,
            },
          }
        );

        if (functionError) throw functionError;

        if (functionData?.error) {
          throw new Error(functionData.error);
        }

        toast({
          title: "Usuário criado com sucesso!",
          description: `${nomeCompleto} foi cadastrado como ${role}. A senha temporária é a data de nascimento (${senhaTemporaria}).`,
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
      <DialogContent className="sm:max-w-[500px]">
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
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="responsavel-legal" className="font-normal cursor-pointer">
                Responsável Legal
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
