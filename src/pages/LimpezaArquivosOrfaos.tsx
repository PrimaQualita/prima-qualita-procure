import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileWarning, HardDrive } from "lucide-react";

interface AnaliseResult {
  totalArquivosStorage: number;
  totalReferenciasDB: number;
  totalArquivosOrfaos: number;
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
}

export default function LimpezaArquivosOrfaos() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<AnaliseResult | null>(null);
  const [limiteExibicao, setLimiteExibicao] = useState<number>(10);

  const executarAnalise = async () => {
    try {
      setLoading(true);
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Limpeza de Arquivos Órfãos</h1>
          <p className="text-muted-foreground mt-2">
            Identifique arquivos no storage que não têm referência no banco de dados
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
              Execute uma análise completa para identificar arquivos órfãos que podem ser removidos
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                  <Card className="border-destructive">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-destructive">Arquivos Órfãos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive">{resultado.totalArquivosOrfaos}</div>
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
                          </CardDescription>
                        </div>
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
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {resultado.arquivosOrfaos.slice(0, limiteExibicao).map((arquivo, index) => (
                          <div key={index} className="flex justify-between items-center p-2 border-b last:border-0">
                            <span className="text-sm font-mono truncate flex-1">{arquivo.nome}</span>
                            <span className="text-sm text-muted-foreground ml-4">
                              {(arquivo.tamanho / 1024).toFixed(2)} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
