import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DialogEnviarCotacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cotacaoId: string;
  processoNumero: string;
  tituloCotacao: string;
  dataLimite: string;
}

export function DialogEnviarCotacao({
  open,
  onOpenChange,
  cotacaoId,
  processoNumero,
  tituloCotacao,
  dataLimite,
}: DialogEnviarCotacaoProps) {
  const [copiado, setCopiado] = useState(false);

  const linkCotacao = `${window.location.origin}/resposta-cotacao/${cotacaoId}`;
  const dataFormatada = new Date(dataLimite).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const textoEmail = `Prezado Fornecedor,

Solicitamos cotação de preços para o processo abaixo:

Processo: ${processoNumero}
Objeto: ${tituloCotacao}
Prazo para Resposta: ${dataFormatada}

Para enviar sua proposta, acesse o link abaixo e preencha as informações solicitadas:

${linkCotacao}

Importante:
- Preencha todos os dados da sua empresa
- Informe os valores unitários de cada item solicitado
- Envie sua resposta até o prazo estabelecido

Atenciosamente,
Departamento de Compras`;

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(textoEmail);
      setCopiado(true);
      toast.success("Texto copiado para a área de transferência!");
      setTimeout(() => setCopiado(false), 2000);
    } catch (error) {
      toast.error("Erro ao copiar texto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enviar Cotação para Fornecedores</DialogTitle>
          <DialogDescription>
            Copie o texto abaixo e cole no corpo do e-mail para seus fornecedores
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <pre className="bg-muted p-4 rounded-lg text-sm whitespace-pre-wrap overflow-auto max-h-96 border">
              {textoEmail}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handleCopiar}
            >
              {copiado ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Texto
                </>
              )}
            </Button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Próximos passos:</strong>
            </p>
            <ol className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-decimal list-inside">
              <li>Copie o texto acima clicando no botão "Copiar Texto"</li>
              <li>Abra seu e-mail institucional (Outlook)</li>
              <li>Crie um novo e-mail e adicione os fornecedores desejados</li>
              <li>Cole o texto no corpo do e-mail</li>
              <li>Revise e envie o e-mail</li>
            </ol>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
