import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search, ChevronRight, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { stripHtml } from "@/lib/htmlUtils";
import { supabase } from "@/integrations/supabase/client";

interface DialogGrupoDetalhesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  tipo: string;
  grupos: any[];
  categoria?: string;
}

// Função para converter número para romano
const toRoman = (num: number): string => {
  const romanNumerals: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  for (const [value, symbol] of romanNumerals) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
};

// Função para extrair ano do grupo
const extrairAno = (grupo: any): string => {
  // Tentar extrair do número do processo (ex: 001/2025)
  if (grupo.processoNumero) {
    const match = grupo.processoNumero.match(/\/(\d{4})$/);
    if (match) return match[1];
  }
  // Tentar extrair do número da seleção
  if (grupo.selecaoNumero) {
    const match = grupo.selecaoNumero.match(/\/(\d{4})$/);
    if (match) return match[1];
  }
  // Tentar extrair de datas
  if (grupo.dataGeracao) {
    const date = new Date(grupo.dataGeracao);
    if (!isNaN(date.getTime())) return date.getFullYear().toString();
  }
  if (grupo.dataCriacao) {
    const date = new Date(grupo.dataCriacao);
    if (!isNaN(date.getTime())) return date.getFullYear().toString();
  }
  // Fallback para ano atual
  return new Date().getFullYear().toString();
};

export function DialogGrupoDetalhes({ open, onOpenChange, titulo, tipo, grupos, categoria }: DialogGrupoDetalhesProps) {
  const [anoSelecionado, setAnoSelecionado] = useState<string | null>(null);
  const [documentosGrupo, setDocumentosGrupo] = useState<{nome: string, documentos: any[], grupo?: any} | null>(null);
  const [searchGrupos, setSearchGrupos] = useState("");
  const [searchDocs, setSearchDocs] = useState("");

  // Agrupar por ano
  const gruposPorAno = useMemo(() => {
    const mapa = new Map<string, any[]>();
    grupos.forEach((grupo: any) => {
      const ano = extrairAno(grupo);
      if (!mapa.has(ano)) {
        mapa.set(ano, []);
      }
      mapa.get(ano)!.push(grupo);
    });
    // Ordenar anos em ordem decrescente (mais recente primeiro)
    return new Map([...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [grupos]);

  // Anos disponíveis
  const anosDisponiveis = useMemo(() => {
    return Array.from(gruposPorAno.keys());
  }, [gruposPorAno]);

  // Grupos do ano selecionado
  const gruposDoAno = useMemo(() => {
    if (!anoSelecionado) return [];
    return gruposPorAno.get(anoSelecionado) || [];
  }, [anoSelecionado, gruposPorAno]);

  // Para planilhas de lances, criar mapa de contagem por seleção
  const planilhasPorSelecao = useMemo(() => {
    if (categoria !== 'planilhas_lances') return new Map();
    const mapa = new Map<string, number>();
    grupos.forEach((grupo: any) => {
      const selecaoId = grupo.selecaoId || grupo.processoNumero || 'unknown';
      mapa.set(selecaoId, (mapa.get(selecaoId) || 0) + 1);
    });
    return mapa;
  }, [grupos, categoria]);

  const getNomeGrupo = (grupo: any, idx: number) => {
    if (tipo === 'fornecedor') return grupo.fornecedorNome;
    
    // Planilhas de Lances da Seleção - agora usa porProcesso
    if (categoria === 'planilhas_lances' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      const selecaoNum = grupo.selecaoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Processo ${processoNum} - ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Avisos de Certame
    if (categoria === 'avisos_certame' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      const selecaoNum = grupo.selecaoNumero || grupo.processoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Processo ${processoNum} - Aviso da ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Editais
    if (categoria === 'editais' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      const selecaoNum = grupo.selecaoNumero || grupo.processoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Processo ${processoNum} - Edital da ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Atas do Certame
    if (categoria === 'atas_certame' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      const selecaoNum = grupo.selecaoNumero || grupo.processoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Processo ${processoNum} - Ata da ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Homologações
    if (categoria === 'homologacoes' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      const selecaoNum = grupo.selecaoNumero || grupo.processoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Processo ${processoNum} - Homologação da ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Autorizações de Seleção
    if (categoria === 'autorizacoes_selecao' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      return `Processo ${processoNum}`;
    }
    
    // Propostas de Seleção - agora usa porProcesso
    if (categoria === 'propostas_selecao' && tipo === 'processo') {
      const processoNum = grupo.processoNumero || 'S/N';
      const selecaoNum = grupo.selecaoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Processo ${processoNum} - ${tipoSelecao} ${selecaoNum}`;
    }
    
    if (tipo === 'selecao') return `Seleção de Fornecedores ${grupo.selecaoNumero || 'S/N'} - ${grupo.selecaoTitulo}`;
    if (tipo === 'processo') {
      if (grupo.tipoSelecao) {
        return `Processo ${grupo.processoNumero} - ${grupo.tipoSelecao} ${grupo.selecaoNumero || ''}`;
      }
      const prefix = grupo.credenciamento ? 'Credenciamento' : 'Processo';
      return `${prefix} ${grupo.processoNumero}`;
    }
    if (tipo === 'tipo') return grupo.tipoNome;
    return grupo.nome || 'Sem nome';
  };
  
  // Função para formatar nome do documento com numeração romana
  const getNomeDocumento = (doc: any, idx: number, totalDocs: number, grupo: any) => {
    // Planilhas de Lances com numeração romana
    if (categoria === 'planilhas_lances' && totalDocs > 1) {
      const selecaoNum = grupo.selecaoNumero || 'S/N';
      const numRomano = idx > 0 ? ` ${toRoman(idx + 1)}` : '';
      return `Planilha de Lances da ${grupo.credenciamento ? 'Credenciamento' : 'Seleção'} ${selecaoNum}${numRomano}`;
    }
    
    // Propostas de Seleção
    if (categoria === 'propostas_selecao' && doc.fornecedorNome) {
      return `Proposta ${doc.fornecedorNome}`;
    }
    
    // Atas do Certame - nome bonito
    if (categoria === 'atas_certame') {
      const selecaoNum = grupo.selecaoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Ata da ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Homologações - nome bonito
    if (categoria === 'homologacoes') {
      const selecaoNum = grupo.selecaoNumero || 'S/N';
      const tipoSelecao = grupo.credenciamento ? 'Credenciamento' : 'Seleção de Fornecedores';
      return `Homologação da ${tipoSelecao} ${selecaoNum}`;
    }
    
    // Usar fileName se já está formatado (vem da edge function)
    return doc.fileName;
  };
  
  const getObjetoProcesso = (grupo: any) => {
    if (tipo === 'processo' && grupo.processoObjeto) {
      return stripHtml(grupo.processoObjeto);
    }
    return null;
  };

  const gruposFiltrados = useMemo(() => {
    let resultado = gruposDoAno;
    
    if (searchGrupos.trim()) {
      const termo = searchGrupos.toLowerCase();
      resultado = gruposDoAno.filter((grupo: any, idx: number) => {
        const nome = getNomeGrupo(grupo, idx).toLowerCase();
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
  }, [gruposDoAno, searchGrupos, tipo]);

  const documentosFiltrados = useMemo(() => {
    if (!documentosGrupo || !searchDocs.trim()) return documentosGrupo?.documentos || [];
    const termo = searchDocs.toLowerCase();
    return documentosGrupo.documentos.filter((doc: any) => 
      doc.fileName.toLowerCase().includes(termo)
    );
  }, [documentosGrupo, searchDocs]);

  // Calcular total de documentos por ano
  const getTotalDocumentosAno = (ano: string) => {
    const gruposAno = gruposPorAno.get(ano) || [];
    return gruposAno.reduce((total: number, grupo: any) => total + (grupo.documentos?.length || 0), 0);
  };

  // Calcular total de tamanho por ano
  const getTotalTamanhoAno = (ano: string) => {
    const gruposAno = gruposPorAno.get(ano) || [];
    return gruposAno.reduce((total: number, grupo: any) => {
      const tamanhoGrupo = grupo.documentos?.reduce((sum: number, doc: any) => sum + (doc.size || 0), 0) || 0;
      return total + tamanhoGrupo;
    }, 0);
  };

  // Reset ao fechar
  const handleClose = (value: boolean) => {
    if (!value) {
      setAnoSelecionado(null);
      setDocumentosGrupo(null);
      setSearchGrupos("");
      setSearchDocs("");
    }
    onOpenChange(value);
  };

  return (
    <>
      {/* Primeiro nível: Seleção de ANO */}
      <Dialog open={open && !anoSelecionado && !documentosGrupo} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{titulo} - Selecione o Ano</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            {anosDisponiveis.map((ano) => (
              <Card 
                key={ano} 
                className="border-primary/20 hover:border-primary/50 cursor-pointer transition-colors"
                onClick={() => setAnoSelecionado(ano)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-lg">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl">{ano}</h3>
                        <p className="text-sm text-muted-foreground">
                          {gruposPorAno.get(ano)?.length || 0} {tipo === 'processo' ? 'processo(s)' : tipo === 'fornecedor' ? 'fornecedor(es)' : 'grupo(s)'} • {getTotalDocumentosAno(ano)} documento(s) • {(getTotalTamanhoAno(ano) / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
            {anosDisponiveis.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum documento encontrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Segundo nível: Lista de grupos do ano */}
      <Dialog open={!!anoSelecionado && !documentosGrupo} onOpenChange={() => setAnoSelecionado(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              <span className="text-muted-foreground">{titulo} •</span> {anoSelecionado}
            </DialogTitle>
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
                      <h3 className="font-semibold text-lg">{getNomeGrupo(grupo, idx)}</h3>
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
                        nome: getNomeGrupo(grupo, idx),
                        documentos: grupo.documentos,
                        grupo: grupo
                      })}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Documentos
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {gruposFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum resultado encontrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Terceiro nível: Documentos do grupo */}
      <Dialog open={!!documentosGrupo} onOpenChange={() => setDocumentosGrupo(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              <span className="text-muted-foreground">{anoSelecionado} •</span> {documentosGrupo?.nome}
            </DialogTitle>
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

              const nomeExibicao = getNomeDocumento(doc, i, documentosFiltrados.length, documentosGrupo?.grupo);

              return (
                <div key={i} className="flex justify-between items-center p-3 bg-muted/50 rounded border">
                  <span className="truncate flex-1 text-sm font-medium">{nomeExibicao}</span>
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
