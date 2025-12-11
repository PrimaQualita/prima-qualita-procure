import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { stripHtml } from "@/lib/htmlUtils";
import { supabase } from "@/integrations/supabase/client";

interface DialogGrupoDetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  tipo: string;
  grupos: any[];
}

export function DialogGrupoDetalhes({ open, onOpenChange, titulo, tipo, grupos }: DialogGrupoDetalhesProps) {
  const [documentosGrupo, setDocumentosGrupo] = useState<{nome: string, documentos: any[]} | null>(null);
  const [searchGrupos, setSearchGrupos] = useState("");
  const [searchDocs, setSearchDocs] = useState("");

  const getNomeGrupo = (grupo: any) => {
    if (tipo === 'fornecedor') return grupo.fornecedorNome;
    if (tipo === 'selecao') return `Seleção de Fornecedores ${grupo.selecaoNumero || 'S/N'} - ${grupo.selecaoTitulo}`;
    if (tipo === 'processo') {
      // Se tem tipoSelecao (usado em avisos/editais), usar ele
      if (grupo.tipoSelecao) {
        return `${grupo.tipoSelecao} ${grupo.selecaoNumero || ''} - Processo ${grupo.processoNumero}`;
      }
      const prefix = grupo.credenciamento ? 'Credenciamento' : 'Processo';
      return `${prefix} ${grupo.processoNumero}`;
    }
    if (tipo === 'tipo') return grupo.tipoNome;
    return grupo.nome || 'Sem nome';
  };
  
  const getObjetoProcesso = (grupo: any) => {
    if (tipo === 'processo' && grupo.processoObjeto) {
      return stripHtml(grupo.processoObjeto);
    }
    return null;
  };

  const gruposFiltrados = useMemo(() => {
    let resultado = grupos;
    
    if (searchGrupos.trim()) {
      const termo = searchGrupos.toLowerCase();
      resultado = grupos.filter((grupo: any) => {
        const nome = getNomeGrupo(grupo).toLowerCase();
        const objeto = getObjetoProcesso(grupo)?.toLowerCase() || "";
        return nome.includes(termo) || objeto.includes(termo);
      });
    }
    
    // Ordenar por número do processo em ordem crescente
    if (tipo === 'processo') {
      return resultado.sort((a: any, b: any) => {
        const numA = a.processoNumero || '';
        const numB = b.processoNumero || '';
        return numA.localeCompare(numB, undefined, { numeric: true });
      });
    }
    
    return resultado;
  }, [grupos, searchGrupos, tipo]);

  const documentosFiltrados = useMemo(() => {
    if (!documentosGrupo || !searchDocs.trim()) return documentosGrupo?.documentos || [];
    const termo = searchDocs.toLowerCase();
    return documentosGrupo.documentos.filter((doc: any) => 
      doc.fileName.toLowerCase().includes(termo)
    );
  }, [documentosGrupo, searchDocs]);

  return (
    <>
      <Dialog open={open && !documentosGrupo} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={searchGrupos}
              onChange={(e) => setSearchGrupos(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {gruposFiltrados?.map((grupo: any, idx: number) => (
              <Card key={idx} className="border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{getNomeGrupo(grupo)}</h3>
                      {getObjetoProcesso(grupo) && (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                          {getObjetoProcesso(grupo)}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">
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
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{documentosGrupo?.nome} - Documentos</DialogTitle>
          </DialogHeader>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar documentos..."
              value={searchDocs}
              onChange={(e) => setSearchDocs(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {documentosFiltrados.map((doc: any, i: number) => {
              const handleVisualizarDocumento = async () => {
                try {
                  // Extrair path limpo da URL ou usar path direto
                  let cleanPath = doc.path || '';
                  
                  // Se for URL completa, extrair apenas o path
                  if (cleanPath.includes('processo-anexos/')) {
                    const match = cleanPath.match(/processo-anexos\/(.+?)(?:\?|$)/);
                    if (match) {
                      cleanPath = match[1];
                    }
                  }
                  
                  // Remover prefixo duplicado se existir
                  if (cleanPath.startsWith('processo-anexos/')) {
                    cleanPath = cleanPath.replace('processo-anexos/', '');
                  }
                  
                  if (cleanPath) {
                    const { data } = await supabase.storage
                      .from('processo-anexos')
                      .createSignedUrl(cleanPath, 3600);
                    if (data?.signedUrl) {
                      window.open(data.signedUrl, '_blank');
                    }
                  }
                } catch (error) {
                  console.error('Erro ao gerar URL:', error);
                }
              };

              return (
                <div key={i} className="flex justify-between items-center p-3 bg-muted/50 rounded border">
                  <span className="truncate flex-1 text-sm font-medium">{doc.fileName}</span>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                      {(doc.size / 1024).toFixed(1)} KB
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={handleVisualizarDocumento}
                      title="Visualizar documento"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
