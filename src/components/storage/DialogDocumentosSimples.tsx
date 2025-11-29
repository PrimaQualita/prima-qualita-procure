import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useMemo } from "react";

interface DialogDocumentosSimplesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  documentos: any[];
}

export function DialogDocumentosSimples({ open, onOpenChange, titulo, documentos }: DialogDocumentosSimplesProps) {
  const [search, setSearch] = useState("");

  const documentosFiltrados = useMemo(() => {
    if (!search.trim()) return documentos;
    const termo = search.toLowerCase();
    return documentos.filter((doc: any) => 
      doc.fileName.toLowerCase().includes(termo)
    );
  }, [documentos, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar documentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {documentosFiltrados.map((doc: any, i: number) => (
            <div key={i} className="flex justify-between items-center p-3 bg-muted/50 rounded border">
              <span className="truncate flex-1 text-sm font-medium">{doc.fileName}</span>
              <span className="ml-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                {(doc.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ))}
          {documentosFiltrados.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum documento encontrado
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
