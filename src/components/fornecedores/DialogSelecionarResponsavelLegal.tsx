import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, CheckCircle, Plus, X } from "lucide-react";

interface DialogSelecionarResponsavelLegalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responsaveisLegais: string[];
  onConfirm: (selecionados: string[]) => void;
  loading?: boolean;
  modoManual?: boolean;
}

export function DialogSelecionarResponsavelLegal({
  open,
  onOpenChange,
  responsaveisLegais,
  onConfirm,
  loading = false,
  modoManual = false,
}: DialogSelecionarResponsavelLegalProps) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [nomesManual, setNomesManual] = useState<string[]>([""]);

  const handleToggle = (nome: string) => {
    setSelecionados((prev) =>
      prev.includes(nome)
        ? prev.filter((n) => n !== nome)
        : [...prev, nome]
    );
  };

  const handleConfirm = () => {
    if (modoManual) {
      const nomesValidos = nomesManual
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      if (nomesValidos.length > 0) {
        onConfirm(nomesValidos);
      }
    } else if (selecionados.length > 0) {
      onConfirm(selecionados);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelecionados([]);
      setNomesManual([""]);
    }
    onOpenChange(isOpen);
  };

  const handleAdicionarNome = () => {
    setNomesManual((prev) => [...prev, ""]);
  };

  const handleRemoverNome = (index: number) => {
    setNomesManual((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAlterarNome = (index: number, valor: string) => {
    setNomesManual((prev) => {
      const novos = [...prev];
      novos[index] = valor;
      return novos;
    });
  };

  const nomesManualValidos = nomesManual.filter((n) => n.trim().length > 0);
  const podeConfirmar = modoManual
    ? nomesManualValidos.length > 0
    : selecionados.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {modoManual
              ? "Identificar Responsável Legal"
              : "Selecionar Responsável Legal"}
          </DialogTitle>
          <DialogDescription>
            {modoManual
              ? "Informe o nome completo (sem abreviações) do(s) Sócio(s) Administrador(es)/Responsável(is) Legal(is) que assina(m) este documento."
              : "Selecione qual(is) responsável(is) legal(is) está(ão) assinando este documento."}
          </DialogDescription>
        </DialogHeader>

        {modoManual ? (
          <div className="py-4 space-y-3">
            {nomesManual.map((nome, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="flex-1">
                  <Label
                    htmlFor={`nome-responsavel-${index}`}
                    className="text-xs text-muted-foreground mb-1 block"
                  >
                    Nome do Sócio Administrador/Responsável Legal {nomesManual.length > 1 ? `#${index + 1}` : ""}
                  </Label>
                  <Input
                    id={`nome-responsavel-${index}`}
                    value={nome}
                    onChange={(e) => handleAlterarNome(index, e.target.value)}
                    placeholder="Nome completo sem abreviações"
                    maxLength={200}
                  />
                </div>
                {nomesManual.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-5 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemoverNome(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdicionarNome}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar outro responsável
            </Button>
          </div>
        ) : (
          <div className="py-4 space-y-3">
            {responsaveisLegais.map((nome, index) => (
              <div
                key={index}
                className="flex items-center space-x-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => handleToggle(nome)}
              >
                <Checkbox
                  id={`responsavel-${index}`}
                  checked={selecionados.includes(nome)}
                  onCheckedChange={() => handleToggle(nome)}
                  onClick={(e) => e.stopPropagation()}
                />
                <Label
                  htmlFor={`responsavel-${index}`}
                  className="flex-1 cursor-pointer font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  {nome}
                </Label>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!podeConfirmar || loading}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {loading ? "Assinando..." : "Confirmar Assinatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
