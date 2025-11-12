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

interface DialogUsuarioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DialogUsuario({ open, onOpenChange, onSuccess }: DialogUsuarioProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [role, setRole] = useState<"gestor" | "colaborador">("colaborador");
  const [responsavelLegal, setResponsavelLegal] = useState(false);

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
      // Data vem como YYYY-MM-DD, converter para DDMMYYYY
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

      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao criar usuário:", error);
      toast({
        title: "Erro ao criar usuário",
        description: error.message || "Ocorreu um erro ao cadastrar o usuário.",
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
          <DialogTitle>Novo Usuário</DialogTitle>
          <DialogDescription>
            Cadastre um novo gestor ou colaborador no sistema. A senha temporária será a data de nascimento.
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
              />
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
              {loading ? "Cadastrando..." : "Cadastrar Usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
