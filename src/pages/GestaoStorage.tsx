import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Database, HardDrive } from "lucide-react";
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
      const { data, error } = await supabase.functions.invoke('limpar-storage', {
        body: { tipo: 'arquivos', paths: resultado.arquivosOrfaos }
      });

      if (error) throw error;

      toast.success(`${data.deletados} arquivos deletados`);
      await executarAnalise();
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    } finally {
      setLimpando(false);
    }
  };

  const limparReferencias = async () => {
    if (!resultado?.referenciasOrfas?.length) return;

    setLimpando(true);
    try {
      const { data, error } = await supabase.functions.invoke('limpar-storage', {
        body: { tipo: 'referencias', paths: resultado.referenciasOrfas }
      });

      if (error) throw error;

      toast.success('Referências limpas');
      await executarAnalise();
    } catch (error: any) {
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Arquivos no Storage</p>
                      <p className="text-2xl font-bold">{resultado.totalArquivosStorage}</p>
                    </div>
                    <HardDrive className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Referências no Banco</p>
                      <p className="text-2xl font-bold">{resultado.totalReferenciasDB}</p>
                    </div>
                    <Database className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Arquivos Órfãos</p>
                      <p className="text-xl font-bold">
                        {resultado.totalArquivosOrfaos}
                        {resultado.totalArquivosOrfaos > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Limpar
                          </Badge>
                        )}
                      </p>
                    </div>
                    {resultado.totalArquivosOrfaos > 0 && (
                      <Button
                        variant="destructive"
                        onClick={limparArquivos}
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

                  {resultado.arquivosOrfaos?.length > 0 && (
                    <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
                      {resultado.arquivosOrfaos.slice(0, 10).map((arq: string, i: number) => (
                        <div key={i}>{arq}</div>
                      ))}
                      {resultado.totalArquivosOrfaos > 10 && (
                        <div>... e mais {resultado.totalArquivosOrfaos - 10}</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Referências Órfãs</p>
                      <p className="text-xl font-bold">
                        {resultado.totalReferenciasOrfas}
                        {resultado.totalReferenciasOrfas > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            Limpar
                          </Badge>
                        )}
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