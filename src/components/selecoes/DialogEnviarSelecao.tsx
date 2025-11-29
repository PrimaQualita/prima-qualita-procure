import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Link, Check } from "lucide-react";

interface DialogEnviarSelecaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selecaoId: string;
  tituloSelecao: string;
  dataDisputa: string;
  horaDisputa: string;
}

export function DialogEnviarSelecao({
  open,
  onOpenChange,
  selecaoId,
  tituloSelecao,
  dataDisputa,
  horaDisputa,
}: DialogEnviarSelecaoProps) {
  const [copiado, setCopiado] = useState(false);

  const linkSelecao = `${window.location.origin}/participar-selecao?id=${selecaoId}`;
  
  // Evita problema de timezone ao parsear data
  const [ano, mes, dia] = dataDisputa.split('-');
  const data = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
  const dataFormatada = data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const handleCopiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkSelecao);
      setCopiado(true);
      toast.success("Link copiado para a área de transferência!");
      
      setTimeout(() => {
        setCopiado(false);
      }, 3000);
    } catch (error) {
      toast.error("Erro ao copiar link");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Link para Seleção de Fornecedores</DialogTitle>
          <DialogDescription>
            Copie o link abaixo e inclua no edital. Fornecedores poderão se cadastrar e participar dos lances.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações da Seleção */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div>
              <span className="font-semibold">Seleção:</span>{" "}
              <span>{tituloSelecao}</span>
            </div>
            <div>
              <span className="font-semibold">Data da Sessão:</span>{" "}
              <span>{dataFormatada}</span>
            </div>
            <div>
              <span className="font-semibold">Horário:</span>{" "}
              <span>{horaDisputa}</span>
            </div>
          </div>

          {/* Link de Participação */}
          <div className="space-y-2">
            <h3 className="font-semibold">Link de Participação</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={linkSelecao}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md bg-muted/50 text-sm"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button onClick={handleCopiarLink} size="default">
                {copiado ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Instruções */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <h4 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">
              📋 Instruções de Uso
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>Inclua este link no edital da seleção de fornecedores</li>
              <li>Fornecedores interessados acessarão o link para se cadastrar</li>
              <li>Após cadastro, poderão registrar propostas e participar dos lances</li>
              <li>O acesso aos lances estará disponível na data e horário da sessão</li>
            </ul>
          </div>

          {/* Botões */}
          <div className="flex gap-2 justify-end">
            <Button onClick={() => onOpenChange(false)} variant="secondary">
              Fechar
            </Button>
            <Button onClick={handleCopiarLink}>
              <Link className="h-4 w-4 mr-2" />
              Copiar Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
