import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileWarning, HardDrive, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AnaliseResult {
  totalArquivosStorage: number;
  totalReferenciasDB: number;
  totalArquivosOrfaos: number;
  totalReferenciasOrfas: number;
  tamanhoTotal: {
    bytes: number;
    mb: number;
    gb: number;
  };
  arquivosOrfaos: Array<{
    nome: string;
    tamanho: number;
    criado: string;
  }>;
  referenciasOrfas: string[];
}

export default function LimpezaArquivosOrfaos() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<AnaliseResult | null>(null);
  const [limiteExibicao, setLimiteExibicao] = useState<number>(10);
  const [arquivosSelecionados, setArquivosSelecionados] = useState<string[]>([]);
  const [deletando, setDeletando] = useState(false);
  const [deletandoReferencias, setDeletandoReferencias] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showConfirmRefDialog, setShowConfirmRefDialog] = useState(false);
  const [deleteType, setDeleteType] = useState<'selecao' | 'todos'>('selecao');

  const executarAnalise = async () => {
    try {
      setLoading(true);
      setArquivosSelecionados([]);
      toast.info("Analisando arquivos no storage...");

      const { data, error } = await supabase.functions.invoke('identificar-arquivos-orfaos');

      if (error) throw error;

      setResultado(data);
      toast.success("Análise concluída!");
    } catch (error) {
      console.error('Erro ao analisar arquivos:', error);
      toast.error("Erro ao analisar arquivos órfãos");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectArquivo = (nomeArquivo: string, checked: boolean) => {
    if (checked) {
      setArquivosSelecionados([...arquivosSelecionados, nomeArquivo]);
    } else {
      setArquivosSelecionados(arquivosSelecionados.filter(a => a !== nomeArquivo));
    }
  };

  const handleSelectTodos = (checked: boolean) => {
    if (checked && resultado) {
      setArquivosSelecionados(resultado.arquivosOrfaos.map(a => a.nome));
    } else {
      setArquivosSelecionados([]);
    }
  };

  const confirmarExclusao = (tipo: 'selecao' | 'todos') => {
    setDeleteType(tipo);
    setShowConfirmDialog(true);
  };

  const executarExclusao = async () => {
    if (!resultado) return;

    try {
      setDeletando(true);
      setShowConfirmDialog(false);

      const arquivosParaDeletar = deleteType === 'todos' 
        ? resultado.arquivosOrfaos.map(a => a.nome)
        : arquivosSelecionados;

      if (arquivosParaDeletar.length === 0) {
        toast.error("Nenhum arquivo selecionado para exclusão");
        return;
      }

      toast.info(`Excluindo ${arquivosParaDeletar.length} arquivo(s)...`);

      const { data, error } = await supabase.functions.invoke('deletar-arquivos-orfaos', {
        body: { arquivos: arquivosParaDeletar }
      });

      if (error) throw error;

      toast.success(`${arquivosParaDeletar.length} arquivo(s) excluído(s) com sucesso!`);
      
      // Re-executar análise para atualizar resultados
      await executarAnalise();
      
    } catch (error) {
      console.error('Erro ao deletar arquivos:', error);
      toast.error("Erro ao excluir arquivos órfãos");
    } finally {
      setDeletando(false);
    }
  };

  const confirmarExclusaoReferencias = () => {
    setShowConfirmRefDialog(true);
  };

  const executarExclusaoReferencias = async () => {
    if (!resultado || resultado.totalReferenciasOrfas === 0) return;

    try {
      setDeletandoReferencias(true);
      setShowConfirmRefDialog(false);

      toast.info(`Limpando ${resultado.totalReferenciasOrfas} referência(s) do banco...`);

      const { data, error } = await supabase.functions.invoke('deletar-referencias-orfas', {
        body: { referencias: resultado.referenciasOrfas }
      });

      if (error) throw error;

      toast.success(`Referências limpas com sucesso! ${data.deletadas} campos atualizados.`);
      
      // Re-executar análise para atualizar resultados
      await executarAnalise();
      
    } catch (error) {
      console.error('Erro ao limpar referências:', error);
      toast.error("Erro ao limpar referências órfãs");
    } finally {
      setDeletandoReferencias(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[100vw] overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Limpeza de Arquivos Órfãos</h1>
          <p className="text-muted-foreground mt-2">
            Identifique arquivos órfãos no storage e referências órfãs no banco de dados
          </p>
        </div>
      </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Análise de Storage
            </CardTitle>
            <CardDescription>
              Execute uma análise completa para identificar arquivos órfãos e referências órfãs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={executarAnalise} 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <FileWarning className="mr-2 h-4 w-4" />
                  Iniciar Análise
                </>
              )}
            </Button>

            {resultado && (
              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Arquivos no Storage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{resultado.totalArquivosStorage}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">Referências no Banco</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{resultado.totalReferenciasDB}</div>
                    </CardContent>
                  </Card>

                  <Card className="border-amber-500">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-amber-600">Arquivos Órfãos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-600">{resultado.totalArquivosOrfaos}</div>
                    </CardContent>
                  </Card>

                  <Card className="border-destructive">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-destructive">Referências Órfãs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive">{resultado.totalReferenciasOrfas}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Espaço Ocupado por Arquivos Órfãos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tamanho em MB:</span>
                      <span className="font-bold">{resultado.tamanhoTotal.mb.toFixed(2)} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tamanho em GB:</span>
                      <span className="font-bold">{resultado.tamanhoTotal.gb.toFixed(4)} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bytes:</span>
                      <span className="font-mono text-sm">{resultado.tamanhoTotal.bytes.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>

                {resultado.totalArquivosOrfaos > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Lista de Arquivos Órfãos</CardTitle>
                          <CardDescription>
                            Mostrando {Math.min(limiteExibicao, resultado.arquivosOrfaos.length)} de {resultado.arquivosOrfaos.length} arquivos
                            {arquivosSelecionados.length > 0 && ` • ${arquivosSelecionados.length} selecionado(s)`}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Select value={limiteExibicao.toString()} onValueChange={(value) => setLimiteExibicao(Number(value))}>
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 arquivos</SelectItem>
                              <SelectItem value="50">50 arquivos</SelectItem>
                              <SelectItem value="100">100 arquivos</SelectItem>
                              <SelectItem value="500">500 arquivos</SelectItem>
                              <SelectItem value="1000">1000 arquivos</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={arquivosSelecionados.length === 0 || deletando}
                            onClick={() => confirmarExclusao('selecao')}
                          >
                            {deletando ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Excluindo...
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir Seleção
                              </>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletando}
                            onClick={() => confirmarExclusao('todos')}
                          >
                            {deletando ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Excluindo...
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir Todos
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 border-b font-medium">
                          <Checkbox
                            checked={arquivosSelecionados.length === resultado.arquivosOrfaos.length}
                            onCheckedChange={handleSelectTodos}
                          />
                          <span className="text-sm">Selecionar todos</span>
                        </div>
                         <div className="space-y-2 max-h-96 overflow-y-auto">
                          {resultado.arquivosOrfaos.slice(0, limiteExibicao).map((arquivo, index) => (
                            <div key={index} className="flex items-start gap-2 p-2 border-b last:border-0">
                              <Checkbox
                                checked={arquivosSelecionados.includes(arquivo.nome)}
                                onCheckedChange={(checked) => handleSelectArquivo(arquivo.nome, checked as boolean)}
                                className="mt-1"
                              />
                              <span className="text-xs font-mono break-all flex-1">{arquivo.nome}</span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                {(arquivo.tamanho / 1024).toFixed(2)} KB
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {resultado.totalReferenciasOrfas > 0 && (
                  <Card className="border-destructive">
                    <CardHeader>
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                            Referências Órfãs (URLs no banco sem arquivo)
                          </CardTitle>
                          <CardDescription>
                            {resultado.totalReferenciasOrfas} URLs estão registradas no banco mas os arquivos não existem no storage
                          </CardDescription>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletandoReferencias}
                          onClick={confirmarExclusaoReferencias}
                        >
                          {deletandoReferencias ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Excluindo...
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Limpar Referências
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                        <p className="text-sm text-destructive font-medium">
                          ⚠️ Estas URLs podem causar erros ao tentar acessar documentos no sistema.
                        </p>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {resultado.referenciasOrfas.slice(0, 50).map((ref, index) => (
                          <div key={index} className="flex items-start gap-2 p-2 border rounded-lg bg-destructive/5">
                            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                            <span className="text-xs font-mono break-all flex-1">{ref}</span>
                          </div>
                        ))}
                      </div>
                      {resultado.referenciasOrfas.length > 50 && (
                        <p className="text-sm text-muted-foreground text-center">
                          Mostrando 50 de {resultado.referenciasOrfas.length} referências
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {resultado.totalArquivosOrfaos === 0 && resultado.totalReferenciasOrfas === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                      <h3 className="text-2xl font-bold mb-2">Tudo limpo!</h3>
                      <p className="text-muted-foreground">
                        Não há arquivos órfãos nem referências órfãs no sistema.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão de Arquivos</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteType === 'todos' ? (
                  <>
                    Você está prestes a excluir <strong>TODOS os {resultado?.totalArquivosOrfaos} arquivos órfãos</strong> do storage.
                    Esta ação não pode ser desfeita.
                  </>
                ) : (
                  <>
                    Você está prestes a excluir <strong>{arquivosSelecionados.length} arquivo(s) selecionado(s)</strong>.
                    Esta ação não pode ser desfeita.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={executarExclusao} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showConfirmRefDialog} onOpenChange={setShowConfirmRefDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Limpeza de Referências</AlertDialogTitle>
              <AlertDialogDescription>
                Você está prestes a excluir <strong>{resultado?.totalReferenciasOrfas} referência(s) órfã(s)</strong> do banco de dados.
                Estas são URLs que não têm arquivos correspondentes no storage.
                <br/><br/>
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={executarExclusaoReferencias} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Limpar Referências
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
