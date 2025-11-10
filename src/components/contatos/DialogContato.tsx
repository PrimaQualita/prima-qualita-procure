import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface Contato {
  id: string;
  tipo_usuario: string;
  assunto: string;
  categoria: string;
  mensagem: string;
  status_atendimento: string;
  created_at: string;
  data_resposta?: string;
  resposta_interna?: string;
}

interface DialogContatoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contato: Contato;
  onResponder: (contatoId: string, resposta: string) => Promise<void>;
}

export function DialogContato({
  open,
  onOpenChange,
  contato,
  onResponder,
}: DialogContatoProps) {
  const [resposta, setResposta] = useState(contato.resposta_interna || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onResponder(contato.id, resposta);
    } finally {
      setLoading(false);
    }
  };

  const jaRespondido = !!contato.resposta_interna;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Contato</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Data</Label>
              <p className="font-medium">
                {new Date(contato.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Tipo de Usuário</Label>
              <p className="font-medium">
                <Badge variant="outline">{contato.tipo_usuario}</Badge>
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Categoria</Label>
              <p className="font-medium">{contato.categoria}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Status</Label>
              <p className="font-medium">
                <Badge>{contato.status_atendimento.replace(/_/g, " ")}</Badge>
              </p>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground">Assunto</Label>
            <p className="font-medium">{contato.assunto}</p>
          </div>

          <div>
            <Label className="text-muted-foreground">Mensagem</Label>
            <div className="mt-1 p-3 bg-muted rounded-md">
              <p className="text-sm whitespace-pre-wrap">{contato.mensagem}</p>
            </div>
          </div>

          {jaRespondido ? (
            <div>
              <Label className="text-muted-foreground">Resposta Enviada</Label>
              <div className="mt-1 p-3 bg-primary/10 rounded-md">
                <p className="text-sm whitespace-pre-wrap">{contato.resposta_interna}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Respondido em: {new Date(contato.data_resposta!).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="resposta">Resposta Interna</Label>
              <Textarea
                id="resposta"
                value={resposta}
                onChange={(e) => setResposta(e.target.value)}
                placeholder="Digite sua resposta..."
                rows={6}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {!jaRespondido && (
            <Button onClick={handleSubmit} disabled={loading || !resposta.trim()}>
              {loading ? "Enviando..." : "Enviar Resposta"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
