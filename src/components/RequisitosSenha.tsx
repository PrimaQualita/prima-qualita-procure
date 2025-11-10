import { Check, X } from "lucide-react";
import { ValidacaoSenha } from "@/lib/validators";

interface RequisitosSenhaProps {
  validacao: ValidacaoSenha;
}

export const RequisitosSenha = ({ validacao }: RequisitosSenhaProps) => {
  const Requisito = ({ atendido, texto }: { atendido: boolean; texto: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {atendido ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={atendido ? "text-primary" : "text-muted-foreground"}>{texto}</span>
    </div>
  );

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
      <p className="text-sm font-medium mb-2">Requisitos da senha:</p>
      <Requisito atendido={validacao.temMinimo8} texto="Mínimo de 8 caracteres" />
      <Requisito atendido={validacao.temMaiuscula} texto="Pelo menos uma letra MAIÚSCULA" />
      <Requisito atendido={validacao.temMinuscula} texto="Pelo menos uma letra minúscula" />
      <Requisito atendido={validacao.temNumero} texto="Pelo menos um número (0-9)" />
      <Requisito
        atendido={validacao.temEspecial}
        texto="Pelo menos um caractere especial (!@#$%...)"
      />
    </div>
  );
};
