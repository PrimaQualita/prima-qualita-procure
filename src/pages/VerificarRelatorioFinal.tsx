import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { stripHtml } from "@/lib/htmlUtils";
import { CheckCircle2, Download, Search, XCircle } from "lucide-react";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";

type RelatorioPayload = {
  id: string;
  protocolo: string;
  data_geracao: string;
  nome_arquivo: string;
  url_arquivo: string;
  cotacao_id: string;
  usuario_gerador_id: string;
  cotacao?: {
    titulo_cotacao?: string;
    processo?: {
      numero_processo_interno?: string;
      objeto_resumido?: string;
    } | null;
  } | null;
  usuario?: {
    nome_completo?: string;
    cpf?: string;
  } | null;
};

function formatarProtocoloNumerico(proto: string) {
  const semHifens = (proto ?? "").replace(/-/g, "").trim();
  if (/^\d{16}$/.test(semHifens)) {
    return semHifens.match(/.{1,4}/g)?.join("-") ?? proto;
  }
  return (proto ?? "").trim();
}

export default function VerificarRelatorioFinal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const protocoloFromUrl = useMemo(() => searchParams.get("protocolo") || "", [searchParams]);

  const [protocolo, setProtocolo] = useState(() => (protocoloFromUrl ? formatarProtocoloNumerico(protocoloFromUrl) : ""));
  const [loading, setLoading] = useState(false);
  const [buscaRealizada, setBuscaRealizada] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioPayload | null>(null);

  useEffect(() => {
    document.title = "Verificar Relatório Final | Prima Qualitá";
  }, []);

  useEffect(() => {
    if (protocoloFromUrl) {
      const proto = formatarProtocoloNumerico(protocoloFromUrl);
      setProtocolo(proto);
      void verificar(proto);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocoloFromUrl]);

  const verificar = async (protoParam?: string) => {
    const proto = (protoParam ?? protocolo).trim();

    if (!proto) {
      toast({
        title: "Protocolo obrigatório",
        description: "Digite o protocolo do Relatório Final para verificar.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setBuscaRealizada(true);
    setRelatorio(null);

    try {
      const protocoloFormatado = formatarProtocoloNumerico(proto);

      const { data: payload, error } = await supabase.functions.invoke("verificar-relatorio-final", {
        body: { protocolo: protocoloFormatado },
      });

      if (error) throw error;

      const rel = payload?.relatorio ?? null;

      if (!rel) {
        toast({
          title: "Relatório não encontrado",
          description: "Não foi possível localizar um Relatório Final com este protocolo.",
          variant: "destructive",
        });
        return;
      }

      setRelatorio(rel);
      toast({
        title: "Relatório verificado",
        description: "Relatório Final autêntico encontrado no sistema.",
      });
    } catch (err) {
      console.error("💥 [VERIFICAÇÃO] Erro ao verificar relatório final:", err);
      toast({
        title: "Erro ao verificar",
        description: "Ocorreu um erro ao buscar o Relatório Final.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const baixar = async () => {
    if (!relatorio?.url_arquivo) return;

    try {
      const response = await fetch(relatorio.url_arquivo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = relatorio.nome_arquivo || "relatorio-final.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Erro ao baixar relatório:", err);
      toast({
        title: "Erro ao baixar",
        description: "Não foi possível baixar o relatório.",
        variant: "destructive",
      });
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 py-12 px-4">
      <section className="container max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <img src={logoHorizontal} alt="Prima Qualità - Verificar Relatório Final" className="h-16" loading="lazy" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">Verificar Relatório Final</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Insira o protocolo para verificar a autenticidade do Relatório Final.
          </p>
        </header>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Buscar Relatório
            </CardTitle>
            <CardDescription>Digite o protocolo completo do Relatório Final</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="protocolo">Protocolo</Label>
              <div className="flex gap-2">
                <Input
                  id="protocolo"
                  placeholder="0000-0000-0000-0000"
                  value={protocolo}
                  onChange={(e) => setProtocolo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verificar()}
                />
                <Button onClick={() => verificar()} disabled={loading} className="whitespace-nowrap">
                  {loading ? "Verificando..." : "Verificar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {relatorio && (
          <Card className="border-2 border-primary">
            <CardHeader className="bg-primary/5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                  <div>
                    <CardTitle className="text-green-600">Relatório Final Autêntico</CardTitle>
                    <CardDescription>Documento verificado e válido</CardDescription>
                  </div>
                </div>
                <Button onClick={baixar} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Protocolo</p>
                  <p className="font-mono font-semibold break-all">{relatorio.protocolo}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Data de Geração</p>
                  <p className="font-semibold">
                    {new Date(relatorio.data_geracao).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "medium" })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Responsável</p>
                  <p className="font-semibold">{relatorio.usuario?.nome_completo || "—"}</p>
                  {relatorio.usuario?.cpf && <p className="text-sm text-muted-foreground">CPF: {relatorio.usuario.cpf}</p>}
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Arquivo</p>
                  <p className="font-semibold break-all">{relatorio.nome_arquivo}</p>
                </div>
              </div>

              {relatorio.cotacao?.processo && (
                <div className="border-t pt-4">
                  <h2 className="font-semibold mb-3">Informações do Processo</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Número do Processo</p>
                      <p className="font-semibold">{relatorio.cotacao.processo.numero_processo_interno || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Cotação</p>
                      <p className="font-semibold">{relatorio.cotacao.titulo_cotacao || "—"}</p>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <p className="text-sm text-muted-foreground">Objeto</p>
                      <p className="font-semibold">{stripHtml(relatorio.cotacao.processo.objeto_resumido || "")}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>Validade Legal:</strong> Este documento possui certificação digital conforme Lei 14.063/2020
                </p>
                <p className="text-xs text-muted-foreground">
                  Hash de Verificação: {relatorio.protocolo?.replace(/-/g, "").substring(0, 32).toUpperCase()}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {buscaRealizada && !loading && protocolo && !relatorio && (
          <Card className="border-2 border-destructive">
            <CardHeader className="bg-destructive/5">
              <div className="flex items-center gap-3">
                <XCircle className="w-8 h-8 text-destructive" />
                <div>
                  <CardTitle className="text-destructive">Relatório Não Encontrado</CardTitle>
                  <CardDescription>Não foi possível localizar um relatório com o protocolo informado</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Verifique se o protocolo foi digitado corretamente e tente novamente.</p>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>Voltar ao Sistema</Button>
        </div>
      </section>
    </main>
  );
}
