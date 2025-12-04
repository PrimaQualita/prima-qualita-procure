import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, FileText, Archive, FolderOpen, ChevronLeft } from "lucide-react";
import { format, parseISO } from "date-fns";
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
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<FornecedorGrupo | null>(null);
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
    if (!data) return null;
    try {
      // Usar parseISO para interpretar a data corretamente sem problemas de timezone
      const dataObj = parseISO(data);
      return format(dataObj, 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return data;
    }
  };

  const getNomeDocumentoComValidade = (doc: DocumentoAntigo) => {
    const nomeBonito = formatarTipoDocumento(doc.tipoDocumento);
    const validade = formatarData(doc.dataValidade);
    if (validade) {
      return `${nomeBonito} - Val. ${validade}`;
    }
    return nomeBonito;
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setFornecedorSelecionado(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Documentos Antigos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {!fornecedorSelecionado ? (
            // Lista de fornecedores
            <>
              {fornecedores.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum documento antigo encontrado
                </p>
              ) : (
                fornecedores.map((fornecedor) => (
                  <div 
                    key={fornecedor.fornecedorId} 
                    className="border rounded-lg p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{fornecedor.fornecedorNome}</p>
                        <p className="text-sm text-muted-foreground">
                          {fornecedor.documentos.length} documento(s)
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFornecedorSelecionado(fornecedor)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Visualizar
                    </Button>
                  </div>
                ))
              )}
            </>
          ) : (
            // Lista de documentos do fornecedor selecionado
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFornecedorSelecionado(null)}
                className="mb-2"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{fornecedorSelecionado.fornecedorNome}</span>
                  </div>
                </div>

                <div className="divide-y">
                  {fornecedorSelecionado.documentos.map((doc, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">
                          {getNomeDocumentoComValidade(doc)}
                        </span>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
