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
import { Label } from "@/components/ui/label";
import { User, CheckCircle } from "lucide-react";

interface DialogSelecionarResponsavelLegalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  responsaveisLegais: string[];
  onConfirm: (selecionados: string[]) => void;
  loading?: boolean;
}

export function DialogSelecionarResponsavelLegal({
  open,
  onOpenChange,
  responsaveisLegais,
  onConfirm,
  loading = false,
}: DialogSelecionarResponsavelLegalProps) {
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const handleToggle = (nome: string) => {
    setSelecionados((prev) =>
      prev.includes(nome)
        ? prev.filter((n) => n !== nome)
        : [...prev, nome]
    );
  };

  const handleConfirm = () => {
    if (selecionados.length > 0) {
      onConfirm(selecionados);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelecionados([]);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Selecionar Responsável Legal
          </DialogTitle>
          <DialogDescription>
            Selecione qual(is) responsável(is) legal(is) está(ão) assinando este documento.
          </DialogDescription>
        </DialogHeader>

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
            disabled={selecionados.length === 0 || loading}
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
