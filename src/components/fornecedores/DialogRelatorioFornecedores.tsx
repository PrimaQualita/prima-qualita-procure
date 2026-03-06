import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import capaLogo from "@/assets/capa-processo-logo.png";
import capaRodape from "@/assets/capa-processo-rodape.png";
import ExcelJS from "exceljs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FiltroTipo = "aprovados" | "pendentes" | "rejeitados" | "docs_vencendo" | "cnae";

interface FornecedorRelatorio {
  id: string;
  razao_social: string;
  cnpj: string;
  email: string;
  status_aprovacao: string;
  documentos?: { tipo_documento: string; data_validade: string | null; nome_arquivo: string }[];
  cnaes?: { codigo_cnae: string; descricao: string }[];
}

const loadImageBase64 = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (ctx) { ctx.drawImage(img, 0, 0); resolve(c.toDataURL("image/png")); }
      else reject(new Error("canvas error"));
    };
    img.onerror = () => reject(new Error("img error"));
    img.src = src;
  });

const normalizarCnae = (v: string) => v.replace(/[.\-\/]/g, "").toLowerCase().trim();

const statusLabel = (s: string) => {
  if (s === "aprovado") return "Aprovado";
  if (s === "pendente") return "Pendente";
  if (s === "reprovado") return "Reprovado";
  return s;
};

const formatDate = (d: string | null) => {
  if (!d) return "-";
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
};

export default function DialogRelatorioFornecedores({ open, onOpenChange }: Props) {
  const [filtro, setFiltro] = useState<FiltroTipo>("aprovados");
  const [filtroCnae, setFiltroCnae] = useState("");
  const [gerando, setGerando] = useState(false);

  const fetchData = async (): Promise<FornecedorRelatorio[]> => {
    let query = supabase.from("fornecedores").select("id, razao_social, cnpj, email, status_aprovacao").not("user_id", "is", null);

    if (filtro === "aprovados") query = query.eq("status_aprovacao", "aprovado");
    else if (filtro === "pendentes") query = query.eq("status_aprovacao", "pendente");
    else if (filtro === "rejeitados") query = query.eq("status_aprovacao", "reprovado");

    const { data: fornecedores, error } = await query.order("razao_social");
    if (error) throw error;
    if (!fornecedores?.length) return [];

    const ids = fornecedores.map(f => f.id);

    // For docs_vencendo, load documents
    if (filtro === "docs_vencendo") {
      const hoje = new Date();
      const limite = new Date();
      limite.setDate(hoje.getDate() + 10);

      const { data: docs } = await supabase
        .from("documentos_fornecedor")
        .select("fornecedor_id, tipo_documento, data_validade, nome_arquivo")
        .in("fornecedor_id", ids)
        .not("data_validade", "is", null)
        .lte("data_validade", limite.toISOString());

      const docsMap: Record<string, any[]> = {};
      docs?.forEach(d => {
        if (!docsMap[d.fornecedor_id]) docsMap[d.fornecedor_id] = [];
        docsMap[d.fornecedor_id].push(d);
      });

      return fornecedores
        .filter(f => docsMap[f.id]?.length > 0)
        .map(f => ({ ...f, documentos: docsMap[f.id] || [] }));
    }

    // For CNAE filter
    if (filtro === "cnae") {
      const { data: cnaes } = await supabase
        .from("cnaes_fornecedor")
        .select("fornecedor_id, codigo_cnae, descricao")
        .in("fornecedor_id", ids);

      const cnaesMap: Record<string, any[]> = {};
      cnaes?.forEach(c => {
        if (!cnaesMap[c.fornecedor_id]) cnaesMap[c.fornecedor_id] = [];
        cnaesMap[c.fornecedor_id].push(c);
      });

      const busca = normalizarCnae(filtroCnae);
      if (!busca) return fornecedores.map(f => ({ ...f, cnaes: cnaesMap[f.id] || [] }));

      return fornecedores
        .filter(f => {
          const cs = cnaesMap[f.id] || [];
          return cs.some(c => normalizarCnae(c.codigo_cnae).includes(busca) || c.descricao.toLowerCase().includes(busca.toLowerCase()));
        })
        .map(f => ({ ...f, cnaes: (cnaesMap[f.id] || []).filter(c => normalizarCnae(c.codigo_cnae).includes(busca) || c.descricao.toLowerCase().includes(busca.toLowerCase())) }));
    }

    return fornecedores;
  };

  const getTituloRelatorio = () => {
    switch (filtro) {
      case "aprovados": return "Fornecedores Aprovados";
      case "pendentes": return "Fornecedores Pendentes";
      case "rejeitados": return "Fornecedores Rejeitados";
      case "docs_vencendo": return "Fornecedores com Documentos Vencidos/A Vencer (10 dias)";
      case "cnae": return `Fornecedores por CNAE${filtroCnae ? ` - ${filtroCnae}` : ""}`;
    }
  };

  const gerarPDF = async () => {
    setGerando(true);
    try {
      const dados = await fetchData();
      if (!dados.length) { toast.warning("Nenhum fornecedor encontrado com o filtro selecionado"); setGerando(false); return; }

      const [logoB64, rodapeB64] = await Promise.all([loadImageBase64(capaLogo), loadImageBase64(capaRodape)]);

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const logoH = 28;
      const rodapeH = 18;

      const addHeaderFooter = () => {
        doc.addImage(logoB64, "PNG", 1.5, 0, pw - 3, logoH);
        doc.addImage(rodapeB64, "PNG", 1.5, ph - rodapeH, pw - 3, rodapeH);
      };

      addHeaderFooter();

      // Title
      let y = logoH + 8;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(getTituloRelatorio(), pw / 2, y, { align: "center" });
      y += 5;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`, pw / 2, y, { align: "center" });
      y += 6;

      // Build table
      let head: string[][] = [];
      let body: string[][] = [];

      if (filtro === "docs_vencendo") {
        head = [["Fornecedor", "CNPJ", "E-mail", "Status", "Documento", "Validade"]];
        dados.forEach(f => {
          (f.documentos || []).forEach((d, i) => {
            const hoje = new Date();
            const validade = d.data_validade ? new Date(d.data_validade) : null;
            const vencido = validade && validade < hoje;
            const statusDoc = vencido ? "VENCIDO" : "A VENCER";
            body.push([
              i === 0 ? f.razao_social : "",
              i === 0 ? f.cnpj : "",
              i === 0 ? f.email : "",
              i === 0 ? statusLabel(f.status_aprovacao) : "",
              `${d.tipo_documento} (${statusDoc})`,
              formatDate(d.data_validade)
            ]);
          });
        });
      } else if (filtro === "cnae") {
        head = [["Fornecedor", "CNPJ", "E-mail", "Status", "CNAE", "Atividade"]];
        dados.forEach(f => {
          (f.cnaes || []).forEach((c, i) => {
            body.push([
              i === 0 ? f.razao_social : "",
              i === 0 ? f.cnpj : "",
              i === 0 ? f.email : "",
              i === 0 ? statusLabel(f.status_aprovacao) : "",
              c.codigo_cnae,
              c.descricao
            ]);
          });
          if (!f.cnaes?.length) {
            body.push([f.razao_social, f.cnpj, f.email, statusLabel(f.status_aprovacao), "-", "-"]);
          }
        });
      } else {
        head = [["Fornecedor", "CNPJ", "E-mail", "Status"]];
        body = dados.map(f => [f.razao_social, f.cnpj, f.email, statusLabel(f.status_aprovacao)]);
      }

      autoTable(doc, {
        head,
        body,
        startY: y,
        margin: { left: 10, right: 10, bottom: rodapeH + 5 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [0, 90, 140], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) addHeaderFooter();
        },
      });

      // Total
      const finalY = (doc as any).lastAutoTable?.finalY || y + 20;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`Total: ${dados.length} fornecedor(es)`, 10, Math.min(finalY + 6, ph - rodapeH - 5));

      doc.save(`relatorio_fornecedores_${filtro}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar PDF: " + err.message);
    } finally {
      setGerando(false);
    }
  };

  const gerarExcel = async () => {
    setGerando(true);
    try {
      const dados = await fetchData();
      if (!dados.length) { toast.warning("Nenhum fornecedor encontrado com o filtro selecionado"); setGerando(false); return; }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Fornecedores");

      // Logo - add as image
      const logoResp = await fetch(capaLogo);
      const logoBlob = await logoResp.blob();
      const logoArrayBuffer = await logoBlob.arrayBuffer();
      const logoId = wb.addImage({ buffer: logoArrayBuffer, extension: "png" });
      ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 700, height: 80 } });

      // Empty rows for logo space
      ws.addRow([]);
      ws.addRow([]);
      ws.addRow([]);
      ws.addRow([]);

      // Title
      const titleRow = ws.addRow([getTituloRelatorio()]);
      titleRow.font = { bold: true, size: 14 };
      titleRow.alignment = { horizontal: "center" };
      ws.mergeCells(titleRow.number, 1, titleRow.number, filtro === "docs_vencendo" || filtro === "cnae" ? 6 : 4);

      const dateRow = ws.addRow([`Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`]);
      dateRow.font = { size: 9, italic: true };
      dateRow.alignment = { horizontal: "center" };
      ws.mergeCells(dateRow.number, 1, dateRow.number, filtro === "docs_vencendo" || filtro === "cnae" ? 6 : 4);

      ws.addRow([]);

      // Headers
      let headers: string[];
      if (filtro === "docs_vencendo") {
        headers = ["Fornecedor", "CNPJ", "E-mail", "Status", "Documento", "Validade"];
      } else if (filtro === "cnae") {
        headers = ["Fornecedor", "CNPJ", "E-mail", "Status", "CNAE", "Atividade"];
      } else {
        headers = ["Fornecedor", "CNPJ", "E-mail", "Status"];
      }

      const headerRow = ws.addRow(headers);
      headerRow.eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF005A8C" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "center" };
        cell.border = {
          top: { style: "thin" }, bottom: { style: "thin" },
          left: { style: "thin" }, right: { style: "thin" }
        };
      });

      // Data rows
      if (filtro === "docs_vencendo") {
        dados.forEach(f => {
          (f.documentos || []).forEach((d, i) => {
            const hoje = new Date();
            const validade = d.data_validade ? new Date(d.data_validade) : null;
            const vencido = validade && validade < hoje;
            ws.addRow([
              i === 0 ? f.razao_social : "",
              i === 0 ? f.cnpj : "",
              i === 0 ? f.email : "",
              i === 0 ? statusLabel(f.status_aprovacao) : "",
              `${d.tipo_documento} (${vencido ? "VENCIDO" : "A VENCER"})`,
              formatDate(d.data_validade)
            ]);
          });
        });
      } else if (filtro === "cnae") {
        dados.forEach(f => {
          (f.cnaes || []).forEach((c, i) => {
            ws.addRow([
              i === 0 ? f.razao_social : "",
              i === 0 ? f.cnpj : "",
              i === 0 ? f.email : "",
              i === 0 ? statusLabel(f.status_aprovacao) : "",
              c.codigo_cnae,
              c.descricao
            ]);
          });
          if (!f.cnaes?.length) {
            ws.addRow([f.razao_social, f.cnpj, f.email, statusLabel(f.status_aprovacao), "-", "-"]);
          }
        });
      } else {
        dados.forEach(f => {
          ws.addRow([f.razao_social, f.cnpj, f.email, statusLabel(f.status_aprovacao)]);
        });
      }

      // Total row
      ws.addRow([]);
      const totalRow = ws.addRow([`Total: ${dados.length} fornecedor(es)`]);
      totalRow.font = { bold: true };

      // Column widths
      ws.getColumn(1).width = 40;
      ws.getColumn(2).width = 22;
      ws.getColumn(3).width = 35;
      ws.getColumn(4).width = 15;
      if (headers.length > 4) {
        ws.getColumn(5).width = 30;
        ws.getColumn(6).width = 40;
      }

      // Border on data cells
      ws.eachRow((row, rowNumber) => {
        if (rowNumber > headerRow.number) {
          row.eachCell(cell => {
            cell.border = {
              top: { style: "thin", color: { argb: "FFE0E0E0" } },
              bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
              left: { style: "thin", color: { argb: "FFE0E0E0" } },
              right: { style: "thin", color: { argb: "FFE0E0E0" } },
            };
          });
        }
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_fornecedores_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Excel gerado com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar Excel: " + err.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Relatório de Fornecedores</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm mb-1 block">Tipo de Relatório</Label>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aprovados">Fornecedores Aprovados</SelectItem>
                <SelectItem value="pendentes">Fornecedores Pendentes</SelectItem>
                <SelectItem value="rejeitados">Fornecedores Rejeitados</SelectItem>
                <SelectItem value="docs_vencendo">Documentos Vencidos / A Vencer (10 dias)</SelectItem>
                <SelectItem value="cnae">Por CNAE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtro === "cnae" && (
            <div>
              <Label className="text-sm mb-1 block">Código ou Descrição CNAE</Label>
              <Input
                placeholder="XX.XX-X-XX ou palavra-chave..."
                value={filtroCnae}
                onChange={(e) => setFiltroCnae(e.target.value)}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={gerarPDF}
              disabled={gerando}
              className="flex-1"
              variant="default"
            >
              {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Baixar PDF
            </Button>
            <Button
              onClick={gerarExcel}
              disabled={gerando}
              className="flex-1"
              variant="outline"
            >
              {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Baixar Excel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
