import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Clock, Bell, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { DialogDocumentosContrato } from "./DialogDocumentosContrato";

interface Props {
  contratoGestaoId: string;
  processoCompraIds?: string[];
  canEdit?: boolean;
}

export function TabAVencer({ contratoGestaoId, processoCompraIds, canEdit }: Props) {
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogDocumentosOpen, setDialogDocumentosOpen] = useState(false);
  const [contratoDocumentos, setContratoDocumentos] = useState<any>(null);

  useEffect(() => {
    loadContratos();
  }, [contratoGestaoId, processoCompraIds]);

  const loadContratos = async () => {
    setLoading(true);
    try {
      // Get processos_para_contratar IDs for the filtered processos_compras
      let pcIds: string[] = [];
      if (processoCompraIds && processoCompraIds.length > 0) {
        const { data: pcData } = await supabase
          .from("processos_para_contratar")
          .select("id")
          .eq("contrato_gestao_id", contratoGestaoId)
          .in("processo_compra_id", processoCompraIds);
        pcIds = pcData?.map(p => p.id) || [];
        if (pcIds.length === 0) {
          setContratos([]);
          setLoading(false);
          return;
        }
      }

      let query = supabase
        .from("contratos_terceiros")
        .select("*, fornecedores(razao_social)")
        .eq("contrato_gestao_id", contratoGestaoId)
        .eq("status", "vigente")
        .not("fim_vigencia_atual", "is", null);

      if (pcIds.length > 0) {
        query = query.in("processo_para_contratar_id", pcIds);
      }

      const { data, error } = await query.order("fim_vigencia_atual", { ascending: true });

      if (error) throw error;
      setContratos(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar contratos a vencer");
    } finally {
      setLoading(false);
    }
  };

  const getHojeBrasilia = () => {
    return toZonedTime(new Date(), "America/Sao_Paulo");
  };

  const getDiasRestantes = (fim: string) => {
    const hoje = getHojeBrasilia();
    const fimDate = new Date(fim + "T23:59:59-03:00");
    return differenceInDays(fimDate, hoje);
  };

  const getAlertColor = (dias: number) => {
    if (dias < 0) return "bg-red-100 text-red-800";
    if (dias <= 45) return "bg-red-100 text-red-800";
    if (dias <= 60) return "bg-yellow-100 text-yellow-800";
    if (dias <= 90) return "bg-blue-100 text-blue-800";
    return "bg-green-100 text-green-800";
  };

  // Only show contracts expiring within 45 days (the purpose of this tab)
  const contratosAVencer = contratos.filter(c => {
    const dias = getDiasRestantes(c.fim_vigencia_atual);
    return dias >= 0 && dias <= 45;
  });

  // Separar contratos que vencem em até 45 dias (alertas)
  const contratosAlerta = contratosAVencer;

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;

  if (contratosAVencer.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Nenhum contrato a vencer nos próximos 45 dias</div>;
  }

  return (
    <div className="space-y-4">
      {/* Notificação de contratos a 45 dias de vencer */}
      {contratosAlerta.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-5 w-5 text-red-600" />
            <span className="font-semibold text-red-800 text-sm">
              ⚠️ {contratosAlerta.length} contrato{contratosAlerta.length > 1 ? "s" : ""} vence{contratosAlerta.length > 1 ? "m" : ""} nos próximos 45 dias!
            </span>
          </div>
          <ul className="space-y-1 ml-7">
            {contratosAlerta.map(c => {
              const dias = getDiasRestantes(c.fim_vigencia_atual);
              return (
                <li key={c.id} className="text-xs text-red-700">
                  <strong>{c.codigo_interno}</strong> — {c.fornecedores?.razao_social || "Sem fornecedor"} — vence em <strong>{dias} dia{dias !== 1 ? "s" : ""}</strong> ({format(new Date(c.fim_vigencia_atual + "T12:00:00"), "dd/MM/yyyy")})
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Objeto</TableHead>
              <TableHead>Fim Vigência</TableHead>
              <TableHead>Dias Restantes</TableHead>
              {canEdit && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contratosAVencer.map((c) => {
              const dias = getDiasRestantes(c.fim_vigencia_atual);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-xs sm:text-sm">{c.codigo_interno}</TableCell>
                  <TableCell className="text-xs sm:text-sm">{c.fornecedores?.razao_social || "—"}</TableCell>
                  <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{c.objeto}</TableCell>
                  <TableCell className="text-xs sm:text-sm">
                    {format(new Date(c.fim_vigencia_atual + "T12:00:00"), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${getAlertColor(dias)}`}>
                      {dias < 0 ? (
                        <><AlertCircle className="h-3 w-3 mr-1" /> Vencido ({Math.abs(dias)} dias)</>
                      ) : (
                        <><Clock className="h-3 w-3 mr-1" /> {dias} dias</>
                      )}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          setContratoDocumentos(c);
                          setDialogDocumentosOpen(true);
                        }}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Aditivo
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Documentos para Aditivos */}
      {contratoDocumentos && (
        <DialogDocumentosContrato
          open={dialogDocumentosOpen}
          onOpenChange={setDialogDocumentosOpen}
          contratoTerceiro={contratoDocumentos}
          contratoGestaoNome=""
          canEdit={canEdit || false}
          onContratoAtualizado={loadContratos}
        />
      )}
    </div>
  );
}
