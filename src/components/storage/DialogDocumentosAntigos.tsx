import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, FileText, Calendar, Archive, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DocumentoAntigo {
  id?: string;
  tipoDocumento: string;
  fileName: string;
  urlArquivo: string;
  dataValidade: string | null;
  dataArquivamento: string;
  processosVinculados: string[];
}

interface FornecedorGrupo {
  fornecedorId: string;
  fornecedorNome: string;
  documentos: DocumentoAntigo[];
}

interface DialogDocumentosAntigosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dados: {
    porFornecedor?: FornecedorGrupo[];
  } | null;
}

export function DialogDocumentosAntigos({ open, onOpenChange, dados }: DialogDocumentosAntigosProps) {
  const fornecedores = dados?.porFornecedor || [];

  const formatarTipoDocumento = (tipo: string) => {
    const mapa: Record<string, string> = {
      'cnd_federal': 'CND Federal',
      'cnd_tributos_estaduais': 'CND Tributos Estaduais',
      'cnd_divida_ativa_estadual': 'CND Dívida Ativa Estadual',
      'cnd_tributos_municipais': 'CND Tributos Municipais',
      'cnd_divida_ativa_municipal': 'CND Dívida Ativa Municipal',
      'crf_fgts': 'CRF FGTS',
      'cndt': 'CNDT',
      'contrato_social': 'Contrato Social',
      'cartao_cnpj': 'Cartão CNPJ',
      'inscricao_estadual_municipal': 'Inscrição Estadual/Municipal',
      'certificado_fornecedor': 'Certificado Fornecedor'
    };
    return mapa[tipo] || tipo;
  };

  const formatarData = (data: string | null) => {
    if (!data) return '-';
    try {
      return format(new Date(data), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return data;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Documentos Antigos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {fornecedores.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum documento antigo encontrado
            </p>
          ) : (
            fornecedores.map((fornecedor) => (
              <div key={fornecedor.fornecedorId} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{fornecedor.fornecedorNome}</span>
                    </div>
                  </div>
                </div>

                <div className="divide-y">
                  {fornecedor.documentos.map((doc, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{formatarTipoDocumento(doc.tipoDocumento)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {doc.fileName}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Validade: {formatarData(doc.dataValidade)}
                          </span>
                          <span>•</span>
                          <span>Arquivado: {formatarData(doc.dataArquivamento)}</span>
                          {doc.processosVinculados?.length > 0 && (
                            <>
                              <span>•</span>
                              <span>{doc.processosVinculados.length} processo(s) vinculado(s)</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(doc.urlArquivo, '_blank')}
                        title="Visualizar documento"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
