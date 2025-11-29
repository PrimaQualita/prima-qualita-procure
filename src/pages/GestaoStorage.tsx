import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Database, HardDrive, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function GestaoStorage() {
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [limpando, setLimpando] = useState(false);

  const executarAnalise = async () => {
    setAnalisando(true);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('analisar-storage');
      
      if (error) throw error;
      
      setResultado(data);
      toast.success('Análise concluída!');
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setAnalisando(false);
    }
  };

  const limparArquivos = async () => {
    if (!resultado?.arquivosOrfaos?.length) return;

    setLimpando(true);
    try {
      // Extrair apenas os paths dos objetos
      const paths = resultado.arquivosOrfaos.map((arq: any) => 
        typeof arq === 'string' ? arq : arq.path
      );
      
      const { data, error } = await supabase.functions.invoke('limpar-storage', {
        body: { tipo: 'arquivos', paths }
      });

      if (error) throw error;

      toast.success(`${data.deletados} arquivos deletados (${resultado.tamanhoOrfaosMB} MB liberados)`);
      await executarAnalise();
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setLimpando(false);
    }
  };

  const limparReferencias = async () => {
    if (!resultado?.referenciasOrfas?.length) {
      console.log('Nenhuma referência órfã para limpar');
      toast.error('Nenhuma referência órfã para limpar');
      return;
    }

    console.log('Iniciando limpeza de referências:', resultado.referenciasOrfas.length);
    setLimpando(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('limpar-storage', {
        body: { tipo: 'referencias', paths: resultado.referenciasOrfas }
      });

      console.log('Resposta da edge function:', { data, error });

      if (error) {
        console.error('Erro da edge function:', error);
        throw error;
      }

      toast.success(`${data?.deletados || 0} referências deletadas`);
      await executarAnalise();
    } catch (error: any) {
      console.error('Erro ao limpar referências:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setLimpando(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestão de Storage</h1>
        <p className="text-muted-foreground">
          Identifique e limpe arquivos e referências órfãs
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Análise de Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={executarAnalise}
            disabled={analisando}
            size="lg"
          >
            {analisando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {analisando ? 'Analisando...' : 'Iniciar Análise'}
          </Button>

          {resultado && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <p className="text-sm font-medium text-green-900">Arquivos no Storage</p>
                      </div>
                      <p className="text-3xl font-bold text-green-700">{resultado.totalArquivosStorage}</p>
                      <p className="text-lg font-semibold text-green-600 mt-1">
                        {resultado.tamanhoTotalMB} MB
                      </p>
                      <p className="text-xs text-green-700/80 mt-1">
                        Total de arquivos e espaço ocupado
                      </p>
                    </div>
                    <HardDrive className="h-10 w-10 text-green-600/40" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="h-4 w-4 text-blue-600" />
                        <p className="text-sm font-medium text-blue-900">Referências no Banco</p>
                      </div>
                      <p className="text-3xl font-bold text-blue-700">{resultado.totalReferenciasDB}</p>
                      <p className="text-xs text-blue-700/80 mt-1">
                        URLs registradas no banco de dados
                      </p>
                    </div>
                    <Database className="h-10 w-10 text-blue-600/40" />
                  </div>
                </CardContent>
              </Card>

              {/* Estatísticas por Categoria */}
              <Card className="border-purple-200 bg-purple-50/50">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-purple-600" />
                      <p className="text-sm font-medium text-purple-900">Fornecedores</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-purple-700">{resultado.estatisticasPorCategoria?.fornecedores?.arquivos || 0}</p>
                      <p className="text-sm text-purple-600">arquivos</p>
                    </div>
                    <p className="text-lg font-semibold text-purple-600">
                      {resultado.estatisticasPorCategoria?.fornecedores?.tamanhoMB || 0} MB
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-indigo-200 bg-indigo-50/50">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-indigo-600" />
                      <p className="text-sm font-medium text-indigo-900">Processos</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-indigo-700">{resultado.estatisticasPorCategoria?.processos?.arquivos || 0}</p>
                      <p className="text-sm text-indigo-600">arquivos</p>
                    </div>
                    <p className="text-lg font-semibold text-indigo-600">
                      {resultado.estatisticasPorCategoria?.processos?.tamanhoMB || 0} MB
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-50/50">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-slate-600" />
                      <p className="text-sm font-medium text-slate-900">Outros</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-slate-700">{resultado.estatisticasPorCategoria?.outros?.arquivos || 0}</p>
                      <p className="text-sm text-slate-600">arquivos</p>
                    </div>
                    <p className="text-lg font-semibold text-slate-600">
                      {resultado.estatisticasPorCategoria?.outros?.tamanhoMB || 0} MB
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-3 border-orange-200 bg-orange-50/30">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <p className="text-sm font-medium text-orange-900">Arquivos Órfãos no Storage</p>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <div>
                          <div className="text-xl font-bold text-orange-700 flex items-center gap-2">
                            <span>{resultado.totalArquivosOrfaos}</span>
                            {resultado.totalArquivosOrfaos > 0 && (
                              <Badge variant="destructive">Deletar</Badge>
                            )}
                          </div>
                          <p className="text-xs text-orange-700/80">arquivos órfãos</p>
                        </div>
                        <div className="border-l border-orange-300 pl-4">
                          <p className="text-lg font-semibold text-orange-600">
                            {resultado.tamanhoOrfaosMB || 0} MB
                          </p>
                          <p className="text-xs text-orange-700/80">espaço desperdiçado</p>
                        </div>
                      </div>
                      <p className="text-xs text-orange-700/80 mt-2">
                        Arquivos que existem no storage mas NÃO têm referência no banco
                      </p>
                    </div>
                    {resultado.totalArquivosOrfaos > 0 && (
                      <Button
                        variant="destructive"
                        onClick={limparArquivos}
                        disabled={limpando}
                        size="lg"
                      >
                        {limpando ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Limpar {resultado.totalArquivosOrfaos} arquivos
                      </Button>
                    )}
                  </div>

                  {resultado.arquivosOrfaos?.length > 0 && (
                    <div className="text-xs text-muted-foreground max-h-40 overflow-y-auto bg-white/50 rounded p-3 space-y-1">
                      {resultado.arquivosOrfaos.slice(0, 15).map((arq: any, i: number) => (
                        <div key={i} className="flex justify-between items-center py-1 border-b border-orange-100 last:border-0">
                          <span className="truncate flex-1">{typeof arq === 'string' ? arq : arq.path}</span>
                          {arq.size && (
                            <span className="ml-2 text-orange-600 font-medium">
                              {(arq.size / 1024).toFixed(1)} KB
                            </span>
                          )}
                        </div>
                      ))}
                      {resultado.totalArquivosOrfaos > 15 && (
                        <div className="text-center pt-2 text-orange-600 font-medium">
                          ... e mais {resultado.totalArquivosOrfaos - 15} arquivos
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-3 border-red-200 bg-red-50/30">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                        <p className="text-sm font-medium text-red-900">Referências Órfãs no Banco</p>
                      </div>
                      <div className="text-xl font-bold text-red-700 flex items-center gap-2">
                        <span>{resultado.totalReferenciasOrfas}</span>
                        {resultado.totalReferenciasOrfas > 0 && (
                          <Badge variant="destructive">
                            Limpar
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-red-700/80 mt-1">
                        Registros no banco que apontam para arquivos que NÃO existem mais no storage (foram deletados)
                      </p>
                    </div>
                    {resultado.totalReferenciasOrfas > 0 && (
                      <Button
                        variant="destructive"
                        onClick={limparReferencias}
                        disabled={limpando}
                      >
                        {limpando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {resultado.referenciasOrfas?.length > 0 && (
                    <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
                      {resultado.referenciasOrfas.slice(0, 10).map((ref: string, i: number) => (
                        <div key={i}>{ref}</div>
                      ))}
                      {resultado.totalReferenciasOrfas > 10 && (
                        <div>... e mais {resultado.totalReferenciasOrfas - 10}</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}