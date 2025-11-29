import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { useState } from "react";

interface DialogGrupoDetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  tipo: string;
  grupos: any[];
}

export function DialogGrupoDetalhes({ open, onOpenChange, titulo, tipo, grupos }: DialogGrupoDetalhesProps) {
  const [documentosGrupo, setDocumentosGrupo] = useState<{nome: string, documentos: any[]} | null>(null);

  const getNomeGrupo = (grupo: any) => {
    if (tipo === 'fornecedor') return grupo.fornecedorNome;
    if (tipo === 'selecao') return `${grupo.selecaoNumero || 'S/N'} - ${grupo.selecaoTitulo}`;
    if (tipo === 'processo') return `${grupo.processoNumero} - ${grupo.processoObjeto?.substring(0, 50)}`;
    if (tipo === 'tipo') return grupo.tipoNome;
    return grupo.nome || 'Sem nome';
  };

  return (
    <>
      <Dialog open={open && !documentosGrupo} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {grupos?.map((grupo: any, idx: number) => (
              <Card key={idx} className="border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{getNomeGrupo(grupo)}</h3>
                      <p className="text-sm text-muted-foreground">
                        {grupo.documentos.length} documento{grupo.documentos.length !== 1 ? 's' : ''} • {' '}
                        {(grupo.documentos.reduce((sum: number, doc: any) => sum + doc.size, 0) / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDocumentosGrupo({
                        nome: getNomeGrupo(grupo),
                        documentos: grupo.documentos
                      })}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Documentos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!documentosGrupo} onOpenChange={() => setDocumentosGrupo(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{documentosGrupo?.nome} - Documentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {documentosGrupo?.documentos.map((doc: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-muted/50 rounded border">
                <span className="truncate flex-1 text-sm font-medium">{doc.fileName}</span>
                <span className="ml-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {(doc.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
