import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Bell, CheckCircle, FileText, XCircle, FileStack, Loader2 } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogDocumentosContrato } from "./DialogDocumentosContrato";
import { registrarAuditoria } from "@/lib/registrarAuditoria";

interface Props {
  contratoGestaoId: string;
  contratoGestaoNome: string;
  processoCompraIds?: string[];
  canEdit?: boolean;
  onStatusChanged?: () => void;
}

export function TabVencidos({ contratoGestaoId, contratoGestaoNome, processoCompraIds, canEdit, onStatusChanged }: Props) {
  const [contratos, setContratos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog ciente
  const [confirmCienteOpen, setConfirmCienteOpen] = useState(false);
  const [contratoParaCiente, setContratoParaCiente] = useState<any>(null);
  const [acaoCiente, setAcaoCiente] = useState<"ciente" | "encerrado" | "rescindido">("ciente");
  
  // Dialog documentos (aditivos)
  const [dialogDocumentosOpen, setDialogDocumentosOpen] = useState(false);
  const [contratoDocumentos, setContratoDocumentos] = useState<any>(null);
  const [baixandoDossieId, setBaixandoDossieId] = useState<string | null>(null);

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
      }

      let query = supabase
        .from("contratos_terceiros")
        .select("*, fornecedores(razao_social)")
        .eq("contrato_gestao_id", contratoGestaoId);

      if (pcIds.length > 0) {
        query = query.or(`processo_para_contratar_id.in.(${pcIds.join(",")}),processo_para_contratar_id.is.null`);
      }

      const { data, error } = await query.order("fim_vigencia_atual", { ascending: true });

      if (error) throw error;

      // Filter: expired contracts OR contracts with status rescindido/encerrado (regardless of expiration)
      const hoje = toZonedTime(new Date(), "America/Sao_Paulo");
      const vencidos = (data || []).filter(c => {
        // Always show rescindido/encerrado contracts
        if (c.status === "rescindido" || c.status === "encerrado") return true;
        // Also show expired contracts
        if (!c.fim_vigencia_atual) return false;
        const fimVigencia = new Date(c.fim_vigencia_atual + "T23:59:59-03:00");
        return fimVigencia < hoje;
      });

      setContratos(vencidos);
    } catch (error: any) {
      toast.error("Erro ao carregar contratos vencidos");
    } finally {
      setLoading(false);
    }
  };

  const handleMarcarCiente = async () => {
    if (!contratoParaCiente) return;
    try {
      const updateData: any = {
        ciente_nao_renovar: true,
        data_ciente: new Date().toISOString(),
        motivo_ciente: acaoCiente === "encerrado" ? "Contrato encerrado" : acaoCiente === "rescindido" ? "Contrato rescindido" : "Não será renovado",
      };

      // Update status for encerrado/rescindido
      if (acaoCiente === "encerrado" || acaoCiente === "rescindido") {
        updateData.status = acaoCiente;
      }

      const { error } = await supabase
        .from("contratos_terceiros")
        .update(updateData)
        .eq("id", contratoParaCiente.id);

      if (error) throw error;

      const labelAcao = acaoCiente === "encerrado" ? "encerrado" : acaoCiente === "rescindido" ? "rescindido" : "ciente - não renovar";

      await registrarAuditoria({
        acao: "atualização",
        entidade: "Contrato com Terceiro",
        entidade_id: contratoParaCiente.id,
        detalhes: {
          tipo: `Marcação: ${labelAcao}`,
          codigo_interno: contratoParaCiente.codigo_interno,
          contrato_gestao: contratoGestaoNome,
          fornecedor: contratoParaCiente.fornecedores?.razao_social || contratoParaCiente.fornecedor_nome_manual || "N/A",
        },
      });

      toast.success(`Contrato marcado como ${labelAcao}`);
      setConfirmCienteOpen(false);
      setContratoParaCiente(null);
      await loadContratos();
      onStatusChanged?.();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  // Contratos vencidos que NÃO foram marcados como ciente e não estão encerrados/rescindidos (notificações ativas)
  const contratosComNotificacao = contratos.filter(c => !c.ciente_nao_renovar && c.status !== "encerrado" && c.status !== "rescindido");
  const contratosCientes = contratos.filter(c => c.ciente_nao_renovar || c.status === "encerrado" || c.status === "rescindido");

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>;

  if (contratos.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Nenhum contrato vencido</div>;
  }

  const handleBaixarDossieContrato = async (contrato: any) => {
    try {
      setBaixandoDossieId(contrato.id);

      interface DocItem {
        created_at: string;
        nome: string;
        url: string | null;
        storage_path: string | null;
      }

      const allDocs: DocItem[] = [];

      if (contrato.url_arquivo_principal || contrato.storage_path_arquivo) {
        allDocs.push({
          created_at: contrato.created_at,
          nome: `Contrato ${contrato.codigo_interno}`,
          url: contrato.url_arquivo_principal,
          storage_path: contrato.storage_path_arquivo,
        });
      }

      const { data: documentosContrato } = await supabase
        .from("documentos_contrato")
        .select("id, created_at, url_arquivo, storage_path, nome, tipo")
        .eq("contrato_terceiro_id", contrato.id);

      if (documentosContrato) {
        for (const doc of documentosContrato) {
          if (doc.url_arquivo || doc.storage_path) {
            allDocs.push({
              created_at: doc.created_at,
              nome: doc.nome,
              url: doc.url_arquivo,
              storage_path: doc.storage_path,
            });
          }
        }
      }

      allDocs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (allDocs.length === 0) {
        toast.error("Nenhum arquivo encontrado para este contrato");
        return;
      }

      const downloadFile = async (doc: DocItem): Promise<ArrayBuffer | null> => {
        try {
          const path = doc.storage_path || doc.url;
          if (!path) return null;

          let bucket = 'processo-anexos';
          let filePath = path;

          if (path.startsWith('http')) {
            if (path.includes('/documents/')) {
              filePath = path.split('/documents/')[1]?.split('?')[0] || path;
              bucket = 'documents';
            } else if (path.includes('/processo-anexos/')) {
              filePath = path.split('/processo-anexos/')[1]?.split('?')[0] || path;
              bucket = 'processo-anexos';
            } else {
              const resp = await fetch(path);
              if (!resp.ok) return null;
              return await resp.arrayBuffer();
            }
          }

          const { data, error } = await supabase.storage.from(bucket).download(decodeURIComponent(filePath));
          if (error || !data) {
            console.warn(`Não foi possível baixar: ${doc.nome}`, error);
            return null;
          }
          return await data.arrayBuffer();
        } catch (err) {
          console.warn(`Erro ao baixar ${doc.nome}:`, err);
          return null;
        }
      };

      toast.info(`Preparando dossiê... Baixando ${allDocs.length} documento(s)`);

      const docBuffers: { nome: string; buffer: ArrayBuffer }[] = [];
      for (const doc of allDocs) {
        const buffer = await downloadFile(doc);
        if (buffer) {
          docBuffers.push({ nome: doc.nome, buffer });
        }
      }

      if (docBuffers.length === 0) {
        toast.error("Nenhum arquivo pôde ser baixado");
        return;
      }

      const mergedPdf = await PDFDocument.create();

      for (const { nome, buffer } of docBuffers) {
        try {
          const docPdf = await PDFDocument.load(buffer);
          const pages = await mergedPdf.copyPages(docPdf, docPdf.getPageIndices());
          pages.forEach(page => mergedPdf.addPage(page));
        } catch (err) {
          console.warn(`Erro ao processar PDF "${nome}", pulando...`, err);
        }
      }

      const totalPages = mergedPdf.getPageCount();
      const fontBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

      for (let i = 0; i < totalPages; i++) {
        const page = mergedPdf.getPage(i);
        const { width, height } = page.getSize();
        const text = `Página ${i + 1} de ${totalPages}`;
        const textWidth = fontBold.widthOfTextAtSize(text, 9);
        const textX = width - textWidth - 30;
        const textY = height - 25;

        page.drawRectangle({
          x: Math.max(textX - 10, width - 170),
          y: textY - 4,
          width: Math.min(150, width),
          height: 16,
          color: rgb(1, 1, 1),
        });

        page.drawText(text, {
          x: textX,
          y: textY,
          size: 9,
          font: fontBold,
          color: rgb(0, 0, 0),
        });
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `Dossie_Contrato_${contrato.codigo_interno.replace(/\//g, '-')}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

      toast.success(`Dossiê baixado! ${totalPages} páginas, ${docBuffers.length} documento(s).`);
    } catch (error: any) {
      console.error("Erro ao gerar dossiê:", error);
      toast.error("Erro ao gerar dossiê: " + error.message);
    } finally {
      setBaixandoDossieId(null);
    }
  };

  const getDiasVencido = (fim: string) => {
    const hoje = toZonedTime(new Date(), "America/Sao_Paulo");
    return Math.abs(differenceInDays(new Date(fim + "T23:59:59-03:00"), hoje));
  };

  return (
    <div className="space-y-4">
      {/* Notificação de contratos vencidos não tratados */}
      {contratosComNotificacao.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-5 w-5 text-red-600" />
            <span className="font-semibold text-red-800 text-sm">
              🚨 {contratosComNotificacao.length} contrato{contratosComNotificacao.length > 1 ? "s" : ""} vencido{contratosComNotificacao.length > 1 ? "s" : ""} sem tratamento!
            </span>
          </div>
          <p className="text-xs text-red-600 ml-7">
            Adicione um Termo Aditivo de prazo para renovar ou marque como "Ciente" para desconsiderar a notificação.
          </p>
        </div>
      )}

      {/* Tabela de contratos vencidos COM notificação */}
      {contratosComNotificacao.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-red-700 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" /> Pendentes de Ação
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Contrato/Ano</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Fim Vigência</TableHead>
                  <TableHead>Dias Vencido</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratosComNotificacao.map((c) => {
                  const dias = getDiasVencido(c.fim_vigencia_atual);
                  return (
                    <TableRow key={c.id} className="bg-red-50/50">
                      <TableCell className="font-medium text-xs sm:text-sm">{c.codigo_interno}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{c.fornecedores?.razao_social || c.fornecedor_nome_manual || "—"}</TableCell>
                      <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{c.objeto}</TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        {format(new Date(c.fim_vigencia_atual + "T12:00:00"), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge className="text-xs bg-red-100 text-red-800">
                          <AlertCircle className="h-3 w-3 mr-1" /> {dias} dias
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {(c.url_arquivo_principal || c.storage_path_arquivo) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={baixandoDossieId === c.id}
                              onClick={() => handleBaixarDossieContrato(c)}
                            >
                              {baixandoDossieId === c.id ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <FileStack className="h-3 w-3 mr-1" />
                              )}
                              Dossiê
                            </Button>
                          )}
                          {canEdit && (
                            <>
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
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  setAcaoCiente("encerrado");
                                  setContratoParaCiente(c);
                                  setConfirmCienteOpen(true);
                                }}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Encerrar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => {
                                  setAcaoCiente("rescindido");
                                  setContratoParaCiente(c);
                                  setConfirmCienteOpen(true);
                                }}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Rescindir
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs text-muted-foreground"
                                onClick={() => {
                                  setAcaoCiente("ciente");
                                  setContratoParaCiente(c);
                                  setConfirmCienteOpen(true);
                                }}
                              >
                                Ciente
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Tabela de contratos marcados como ciente */}
      {contratosCientes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> Encerrados / Ciente - Não renovados
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Contrato/Ano</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Fim Vigência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratosCientes.map((c) => {
                  const statusLabel = c.status === "rescindido" ? "Rescindido" : c.status === "encerrado" ? "Encerrado" : "Ciente";
                  return (
                    <TableRow key={c.id} className="opacity-60">
                      <TableCell className="font-medium text-xs sm:text-sm">{c.codigo_interno}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{c.fornecedores?.razao_social || c.fornecedor_nome_manual || "—"}</TableCell>
                      <TableCell className="text-xs sm:text-sm max-w-[200px] truncate">{c.objeto}</TableCell>
                      <TableCell className="text-xs sm:text-sm">
                        {format(new Date(c.fim_vigencia_atual + "T12:00:00"), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" /> {statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Confirm Ciente/Encerrar/Rescindir */}
      <ConfirmDialog
        open={confirmCienteOpen}
        onOpenChange={setConfirmCienteOpen}
        onConfirm={handleMarcarCiente}
        title={
          acaoCiente === "encerrado" ? "Encerrar Contrato" :
          acaoCiente === "rescindido" ? "Rescindir Contrato" :
          "Marcar como Ciente - Não Renovar"
        }
        description={
          acaoCiente === "encerrado"
            ? `Tem certeza que deseja marcar o contrato "${contratoParaCiente?.codigo_interno}" (${contratoParaCiente?.fornecedores?.razao_social || contratoParaCiente?.fornecedor_nome_manual || "sem fornecedor"}) como encerrado? O status será alterado e a notificação será removida.`
            : acaoCiente === "rescindido"
            ? `Tem certeza que deseja rescindir o contrato "${contratoParaCiente?.codigo_interno}" (${contratoParaCiente?.fornecedores?.razao_social || contratoParaCiente?.fornecedor_nome_manual || "sem fornecedor"})? O status será alterado para rescindido e a notificação será removida.`
            : `Tem certeza que deseja marcar o contrato "${contratoParaCiente?.codigo_interno}" (${contratoParaCiente?.fornecedores?.razao_social || contratoParaCiente?.fornecedor_nome_manual || "sem fornecedor"}) como ciente e que não será renovado? A notificação será desconsiderada.`
        }
        confirmText="Confirmar"
        cancelText="Cancelar"
      />

      {/* Dialog Documentos para Aditivos */}
      {contratoDocumentos && (
        <DialogDocumentosContrato
          open={dialogDocumentosOpen}
          onOpenChange={setDialogDocumentosOpen}
          contratoTerceiro={contratoDocumentos}
          contratoGestaoNome={contratoGestaoNome}
          canEdit={canEdit || false}
          onContratoAtualizado={loadContratos}
        />
      )}
    </div>
  );
}
