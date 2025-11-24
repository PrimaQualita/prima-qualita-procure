import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy } from "lucide-react";

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
  const dataFormatada = new Date(dataDisputa).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const textoEmail = `Prezado(a) Fornecedor(a),

Você está sendo convidado(a) a participar da seguinte seleção de fornecedores:

SELEÇÃO: ${tituloSelecao}
DATA DA SESSÃO DE DISPUTA: ${dataFormatada}
HORÁRIO: ${horaDisputa}

Para participar da disputa de lances, acesse o link abaixo utilizando suas credenciais de acesso:

${linkSelecao}

IMPORTANTE:
- Certifique-se de estar logado no sistema no horário da sessão de disputa
- Leia atentamente o Edital e o Aviso de Seleção antes de participar
- Os lances devem ser decrescentes (valores menores que o lance anterior)
- O sistema aceita lances em tempo real durante a sessão
- O fornecedor com o menor preço (ou maior desconto, conforme critério) será declarado vencedor

Para dúvidas ou mais informações, entre em contato através do sistema.

Atenciosamente,
Departamento de Compras`;

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(textoEmail);
      setCopiado(true);
      toast.success("Texto copiado para a área de transferência!");
      
      setTimeout(() => {
        setCopiado(false);
      }, 3000);
    } catch (error) {
      toast.error("Erro ao copiar texto");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Convite para Fornecedores</DialogTitle>
          <DialogDescription>
            Copie o texto abaixo e envie por e-mail para os fornecedores convidados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm font-mono">{textoEmail}</pre>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCopiar}
              className="flex-1"
              variant={copiado ? "default" : "outline"}
            >
              <Copy className="h-4 w-4 mr-2" />
              {copiado ? "Copiado!" : "Copiar Texto"}
            </Button>

            <Button onClick={() => onOpenChange(false)} variant="secondary">
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
