import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search, ChevronLeft, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { stripHtml } from "@/lib/htmlUtils";
import { supabase } from "@/integrations/supabase/client";

interface Recurso {
  path: string;
  fileName: string;
  size: number;
  fornecedorNome: string;
}

interface Fornecedor {
  fornecedorId: string;
  fornecedorNome: string;
  recursos: Recurso[];
}

interface Processo {
  processoId: string;
  processoNumero: string;
  processoObjeto: string;
  fornecedores: Fornecedor[];
}

interface DialogRecursosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processos: Processo[];
}

type TipoRecurso = 'enviados' | 'respostas';

// Extrair ano do processo
const extrairAno = (proc: Processo): string => {
  if (proc.processoNumero) {
    const match = proc.processoNumero.match(/\/(\d{4})$/);
    if (match) return match[1];
  }
  return new Date().getFullYear().toString();
};

export function DialogRecursos({ open, onOpenChange, processos }: DialogRecursosProps) {
  const [anoSelecionado, setAnoSelecionado] = useState<string | null>(null);
  const [processoSelecionado, setProcessoSelecionado] = useState<Processo | null>(null);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [tipoRecursoSelecionado, setTipoRecursoSelecionado] = useState<TipoRecurso | null>(null);
  const [searchProcessos, setSearchProcessos] = useState("");
  const [searchFornecedores, setSearchFornecedores] = useState("");
  const [searchRecursos, setSearchRecursos] = useState("");

  // Agrupar processos por ano
  const processosPorAno = useMemo(() => {
    const mapa = new Map<string, Processo[]>();
    processos.forEach((proc) => {
      const ano = extrairAno(proc);
      if (!mapa.has(ano)) {
        mapa.set(ano, []);
      }
      mapa.get(ano)!.push(proc);
    });
    return new Map([...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0])));
  }, [processos]);

  const anosDisponiveis = useMemo(() => Array.from(processosPorAno.keys()), [processosPorAno]);

  const processosDoAno = useMemo(() => {
    if (!anoSelecionado) return [];
    return processosPorAno.get(anoSelecionado) || [];
  }, [anoSelecionado, processosPorAno]);

  // View atual: 'anos' | 'processos' | 'fornecedores' | 'tipos' | 'recursos'
  const view = tipoRecursoSelecionado ? 'recursos' : fornecedorSelecionado ? 'tipos' : processoSelecionado ? 'fornecedores' : anoSelecionado ? 'processos' : 'anos';

  const handleVoltar = () => {
    if (view === 'recursos') {
      setTipoRecursoSelecionado(null);
      setSearchRecursos("");
    } else if (view === 'tipos') {
      setFornecedorSelecionado(null);
    } else if (view === 'fornecedores') {
      setProcessoSelecionado(null);
      setSearchFornecedores("");
    } else if (view === 'processos') {
      setAnoSelecionado(null);
      setSearchProcessos("");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setAnoSelecionado(null);
    setProcessoSelecionado(null);
    setFornecedorSelecionado(null);
    setTipoRecursoSelecionado(null);
    setSearchProcessos("");
    setSearchFornecedores("");
    setSearchRecursos("");
  };

  const processosFiltrados = useMemo(() => {
    let resultado = processosDoAno;
    
    if (searchProcessos.trim()) {
      const termo = searchProcessos.toLowerCase();
      resultado = processosDoAno.filter((proc) => {
        const numero = proc.processoNumero.toLowerCase();
        const objeto = stripHtml(proc.processoObjeto).toLowerCase();
        return numero.includes(termo) || objeto.includes(termo);
      });
    }
    
    return resultado.sort((a, b) => {
      const numA = a.processoNumero.split('/')[0];
      const numB = b.processoNumero.split('/')[0];
      return numA.localeCompare(numB, undefined, { numeric: true });
    });
  }, [processosDoAno, searchProcessos]);

  const fornecedoresFiltrados = useMemo(() => {
    if (!processoSelecionado) return [];
    if (!searchFornecedores.trim()) return processoSelecionado.fornecedores;
    const termo = searchFornecedores.toLowerCase();
    return processoSelecionado.fornecedores.filter((forn) => 
      forn.fornecedorNome.toLowerCase().includes(termo)
    );
  }, [processoSelecionado, searchFornecedores]);

  // Separar recursos enviados e respostas
  const getRecursosPorTipo = (fornecedor: Fornecedor, tipo: TipoRecurso) => {
    return fornecedor.recursos.filter(rec => {
      if (tipo === 'enviados') {
        return rec.path.includes('/enviados/') || (rec.path.includes('recurso_') && !rec.path.includes('resposta_recurso'));
      } else {
        return rec.path.includes('/respostas/') || rec.path.includes('resposta_recurso');
      }
    });
  };

  const recursosEnviados = useMemo(() => {
    if (!fornecedorSelecionado) return [];
    return getRecursosPorTipo(fornecedorSelecionado, 'enviados');
  }, [fornecedorSelecionado]);

  const recursosRespostas = useMemo(() => {
    if (!fornecedorSelecionado) return [];
    return getRecursosPorTipo(fornecedorSelecionado, 'respostas');
  }, [fornecedorSelecionado]);

  const recursosFiltrados = useMemo(() => {
    if (!fornecedorSelecionado || !tipoRecursoSelecionado) return [];
    const recursos = tipoRecursoSelecionado === 'enviados' ? recursosEnviados : recursosRespostas;
    if (!searchRecursos.trim()) return recursos;
    const termo = searchRecursos.toLowerCase();
    return recursos.filter((rec) => 
      rec.fileName.toLowerCase().includes(termo)
    );
  }, [fornecedorSelecionado, tipoRecursoSelecionado, recursosEnviados, recursosRespostas, searchRecursos]);

  const getTotalRecursosProcesso = (proc: Processo) => {
    return proc.fornecedores.reduce((sum, forn) => sum + forn.recursos.length, 0);
  };

  const getTotalSizeProcesso = (proc: Processo) => {
    return proc.fornecedores.reduce((sum, forn) => 
      sum + forn.recursos.reduce((recSum, rec) => recSum + rec.size, 0), 0
    );
  };

  const getTotalRecursosAno = (ano: string) => {
    const procs = processosPorAno.get(ano) || [];
    return procs.reduce((sum, proc) => sum + getTotalRecursosProcesso(proc), 0);
  };

  const getTotalSizeAno = (ano: string) => {
    const procs = processosPorAno.get(ano) || [];
    return procs.reduce((sum, proc) => sum + getTotalSizeProcesso(proc), 0);
  };

  const formatRecursoName = (recurso: Recurso, tipo: TipoRecurso) => {
    if (tipo === 'respostas') {
      return `Resposta Recurso ${recurso.fornecedorNome}`;
    }
    return `Recurso ${recurso.fornecedorNome}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {view !== 'anos' && (
              <Button variant="ghost" size="sm" onClick={handleVoltar}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>
              {view === 'anos' && 'Recursos - Selecione o Ano'}
              {view === 'processos' && <><span className="text-muted-foreground">Recursos •</span> {anoSelecionado}</>}
              {view === 'fornecedores' && `Processo ${processoSelecionado!.processoNumero} - Fornecedores`}
              {view === 'tipos' && `${fornecedorSelecionado!.fornecedorNome} - Tipos de Recurso`}
              {view === 'recursos' && `${tipoRecursoSelecionado === 'enviados' ? 'Recursos Enviados' : 'Respostas de Recursos'}`}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Seleção de Ano */}
        {view === 'anos' && (
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
                          {processosPorAno.get(ano)?.length || 0} processo(s) • {getTotalRecursosAno(ano)} recurso(s) • {(getTotalSizeAno(ano) / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {anosDisponiveis.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum recurso encontrado.</p>
            )}
          </div>
        )}

        {/* Barra de pesquisa */}
        {view !== 'anos' && view !== 'tipos' && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                view === 'processos' ? "Pesquisar processos..." :
                view === 'fornecedores' ? "Pesquisar fornecedores..." :
                "Pesquisar recursos..."
              }
              value={view === 'processos' ? searchProcessos : view === 'fornecedores' ? searchFornecedores : searchRecursos}
              onChange={(e) => {
                if (view === 'processos') setSearchProcessos(e.target.value);
                else if (view === 'fornecedores') setSearchFornecedores(e.target.value);
                else setSearchRecursos(e.target.value);
              }}
              className="pl-9"
            />
          </div>
        )}

        {/* Listagem de Processos */}
        {view === 'processos' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {processosFiltrados.map((proc) => (
              <Card key={proc.processoId} className="border-amber-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">Processo {proc.processoNumero}</h3>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words line-clamp-2">
                        {stripHtml(proc.processoObjeto)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {proc.fornecedores.length} fornecedor{proc.fornecedores.length !== 1 ? 'es' : ''} • {' '}
                        {getTotalRecursosProcesso(proc)} recurso{getTotalRecursosProcesso(proc) !== 1 ? 's' : ''} • {' '}
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
              <Card key={forn.fornecedorId} className="border-amber-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{forn.fornecedorNome}</h3>
                      <p className="text-sm text-muted-foreground mt-2">
                        {forn.recursos.length} recurso{forn.recursos.length !== 1 ? 's' : ''} • {' '}
                        {(forn.recursos.reduce((sum, rec) => sum + rec.size, 0) / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFornecedorSelecionado(forn);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Recursos
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

        {/* Seleção de Tipo de Recurso */}
        {view === 'tipos' && (
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            <Card className="border-amber-200">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Recursos Enviados</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {recursosEnviados.length} arquivo{recursosEnviados.length !== 1 ? 's' : ''} • {' '}
                      {(recursosEnviados.reduce((sum, rec) => sum + rec.size, 0) / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTipoRecursoSelecionado('enviados')}
                    disabled={recursosEnviados.length === 0}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Respostas de Recursos</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {recursosRespostas.length} arquivo{recursosRespostas.length !== 1 ? 's' : ''} • {' '}
                      {(recursosRespostas.reduce((sum, rec) => sum + rec.size, 0) / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTipoRecursoSelecionado('respostas')}
                    disabled={recursosRespostas.length === 0}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Listagem de Recursos */}
        {view === 'recursos' && (
          <div className="space-y-2 overflow-y-auto flex-1 pr-2">
            {recursosFiltrados.map((rec, i) => {
              const handleVisualizarRecurso = async () => {
                try {
                  let cleanPath = rec.path || '';
                  
                  if (cleanPath.includes('processo-anexos/')) {
                    const match = cleanPath.match(/processo-anexos\/(.+?)(?:\?|$)/);
                    if (match) {
                      cleanPath = match[1];
                    }
                  }
                  
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
                  <span className="truncate flex-1 text-sm font-medium">{formatRecursoName(rec, tipoRecursoSelecionado!)}</span>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                      {(rec.size / 1024).toFixed(1)} KB
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={handleVisualizarRecurso}
                      title="Visualizar documento"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {recursosFiltrados.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum recurso encontrado.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
