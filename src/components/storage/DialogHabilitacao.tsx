import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search, ChevronLeft } from "lucide-react";
import { useState, useMemo } from "react";
import { stripHtml } from "@/lib/htmlUtils";

interface Documento {
  path: string;
  fileName: string;
  size: number;
}

interface Fornecedor {
  fornecedorId: string;
  fornecedorNome: string;
  documentos: Documento[];
}

interface Processo {
  processoId: string;
  processoNumero: string;
  processoObjeto: string;
  credenciamento: boolean;
  fornecedores: Fornecedor[];
}

interface DialogHabilitacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processos: Processo[];
}

export function DialogHabilitacao({ open, onOpenChange, processos }: DialogHabilitacaoProps) {
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [searchProcessos, setSearchProcessos] = useState("");
  const [searchFornecedores, setSearchFornecedores] = useState("");
  const [searchDocs, setSearchDocs] = useState("");

  // View atual: 'processos' | 'fornecedores' | 'documentos'
  const view = fornecedorSelecionado ? 'documentos' : processoSelecionado ? 'fornecedores' : 'processos';

  const handleVoltar = () => {
    if (view === 'documentos') {
      setFornecedorSelecionado(null);
      setSearchDocs("");
    } else if (view === 'fornecedores') {
      setProcessoSelecionado(null);
      setSearchFornecedores("");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setProcessoSelecionado(null);
    setFornecedorSelecionado(null);
    setSearchProcessos("");
    setSearchFornecedores("");
    setSearchDocs("");
  };

  const processosFiltrados = useMemo(() => {
    if (!searchProcessos.trim()) return processos;
    const termo = searchProcessos.toLowerCase();
    return processos.filter((proc) => {
      const numero = proc.processoNumero.toLowerCase();
      const objeto = stripHtml(proc.processoObjeto).toLowerCase();
      return numero.includes(termo) || objeto.includes(termo);
    });
  }, [processos, searchProcessos]);

  const fornecedoresFiltrados = useMemo(() => {
    if (!processoSelecionado) return [];
    if (!searchFornecedores.trim()) return processoSelecionado.fornecedores;
    const termo = searchFornecedores.toLowerCase();
    return processoSelecionado.fornecedores.filter((forn) => 
      forn.fornecedorNome.toLowerCase().includes(termo)
    );
  }, [processoSelecionado, searchFornecedores]);

  const documentosFiltrados = useMemo(() => {
    if (!fornecedorSelecionado) return [];
    if (!searchDocs.trim()) return fornecedorSelecionado.documentos;
    const termo = searchDocs.toLowerCase();
    return fornecedorSelecionado.documentos.filter((doc) => 
      doc.fileName.toLowerCase().includes(termo)
    );
  }, [fornecedorSelecionado, searchDocs]);

  const getProcessoLabel = (proc: Processo) => {
    const prefix = proc.credenciamento ? 'Credenciamento' : 'Processo';
    return `${prefix} ${proc.processoNumero}`;
  };

  const getTotalDocsProcesso = (proc: Processo) => {
    return proc.fornecedores.reduce((sum, forn) => sum + forn.documentos.length, 0);
  };

  const getTotalSizeProcesso = (proc: Processo) => {
    return proc.fornecedores.reduce((sum, forn) => 
      sum + forn.documentos.reduce((docSum, doc) => docSum + doc.size, 0), 0
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {view !== 'processos' && (
              <Button variant="ghost" size="sm" onClick={handleVoltar}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>
              {view === 'processos' && 'Habilitação - Processos'}
              {view === 'fornecedores' && `${getProcessoLabel(processoSelecionado!)} - Fornecedores`}
              {view === 'documentos' && `${fornecedorSelecionado!.fornecedorNome} - Documentos`}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Barra de pesquisa */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              view === 'processos' ? "Pesquisar processos..." :
              view === 'fornecedores' ? "Pesquisar fornecedores..." :
              "Pesquisar documentos..."
            }
            value={view === 'processos' ? searchProcessos : view === 'fornecedores' ? searchFornecedores : searchDocs}
            onChange={(e) => {
              if (view === 'processos') setSearchProcessos(e.target.value);
              else if (view === 'fornecedores') setSearchFornecedores(e.target.value);
              else setSearchDocs(e.target.value);
            }}
            className="pl-9"
          />
        </div>

        {/* Listagem de Processos */}
        {view === 'processos' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {processosFiltrados.map((proc) => (
              <Card key={proc.processoId} className="border-rose-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{getProcessoLabel(proc)}</h3>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2">
                        {stripHtml(proc.processoObjeto)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {proc.fornecedores.length} fornecedor{proc.fornecedores.length !== 1 ? 'es' : ''} • {' '}
                        {getTotalDocsProcesso(proc)} documento{getTotalDocsProcesso(proc) !== 1 ? 's' : ''} • {' '}
                        {(getTotalSizeProcesso(proc) / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProcessoSelecionado(proc);
                        setSearchFornecedores("");
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Fornecedores
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {processosFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum processo encontrado.
              </p>
            )}
          </div>
        )}

        {/* Listagem de Fornecedores */}
        {view === 'fornecedores' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {fornecedoresFiltrados.map((forn) => (
              <Card key={forn.fornecedorId} className="border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{forn.fornecedorNome}</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        {forn.documentos.length} documento{forn.documentos.length !== 1 ? 's' : ''} • {' '}
                        {(forn.documentos.reduce((sum, doc) => sum + doc.size, 0) / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFornecedorSelecionado(forn);
                        setSearchDocs("");
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Documentos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {fornecedoresFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum fornecedor encontrado.
              </p>
            )}
          </div>
        )}

        {/* Listagem de Documentos */}
        {view === 'documentos' && (
          <div className="space-y-2 overflow-y-auto flex-1 pr-2">
            {documentosFiltrados.map((doc, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-muted/50 rounded border">
                <span className="truncate flex-1 text-sm font-medium">{doc.fileName}</span>
                <span className="ml-4 text-sm font-medium text-muted-foreground whitespace-nowrap">
                  {(doc.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
            {documentosFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum documento encontrado.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
