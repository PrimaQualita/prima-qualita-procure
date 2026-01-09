import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, Building2, Check, Clock } from "lucide-react";

interface Mensagem {
  id: string;
  assunto: string;
  conteudo: string;
  remetente_tipo: "interno" | "fornecedor";
  remetente_nome?: string;
  created_at: string;
}

interface MensagemComDestinatarios extends Mensagem {
  destinatarios: {
    id: string;
    tipo: string;
    nome: string;
    lida: boolean;
  }[];
}

interface DialogVerMensagemProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mensagem: Mensagem | MensagemComDestinatarios;
  tipo: "recebida" | "enviada";
}

export function DialogVerMensagem({
  open,
  onOpenChange,
  mensagem,
  tipo,
}: DialogVerMensagemProps) {
  const temDestinatarios = "destinatarios" in mensagem;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mensagem.assunto}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Informações do remetente/destinatários */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Data</Label>
              <p className="font-medium">
                {new Date(mensagem.created_at).toLocaleString("pt-BR")}
              </p>
            </div>

            {tipo === "recebida" && (
              <div>
                <Label className="text-muted-foreground">Remetente</Label>
                <div className="flex items-center gap-2 mt-1">
                  {mensagem.remetente_tipo === "interno" ? (
                    <Users className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">{mensagem.remetente_nome || "Desconhecido"}</span>
                  <Badge variant="outline" className="text-xs">
                    {mensagem.remetente_tipo === "interno" ? "Interno" : "Fornecedor"}
                  </Badge>
                </div>
              </div>
            )}

            {tipo === "enviada" && temDestinatarios && (
              <div>
                <Label className="text-muted-foreground">
                  Destinatários ({(mensagem as MensagemComDestinatarios).destinatarios.length})
                </Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(mensagem as MensagemComDestinatarios).destinatarios.map((d) => (
                    <Badge
                      key={d.id}
                      variant={d.lida ? "secondary" : "outline"}
                      className="flex items-center gap-1"
                    >
                      {d.tipo === "interno" ? (
                        <Users className="h-3 w-3" />
                      ) : (
                        <Building2 className="h-3 w-3" />
                      )}
                      {d.nome}
                      {d.lida ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Clock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Conteúdo da mensagem */}
          <div>
            <Label className="text-muted-foreground">Mensagem</Label>
            <div className="mt-2 p-4 bg-muted rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{mensagem.conteudo}</p>
            </div>
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
