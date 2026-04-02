import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, FileText, Check, X, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/registrarAuditoria";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoGestaoId: string;
  contratoGestaoNome: string;
  onImportado: () => void;
}

interface LinhaContrato {
  codigo_interno: string;
  fornecedor_nome: string;
  objeto: string;
  data_assinatura: string;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string;
  valor_inicial: number;
  valor_atual: number;
  nome_arquivo: string;
  // Match info
  fornecedor_id: string | null;
  arquivo_match: File | null;
  erro: string | null;
}

const statusMap: Record<string, string> = {
  "vigente": "vigente",
  "encerrado": "encerrado",
  "rescindido": "rescindido",
  "rascunho": "rascunho",
};

function parseDate(val: any): string {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const str = String(val).trim();
  // dd/mm/yyyy
  const parts = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return "";
}

function parseNumber(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  // R$ 1.234,56 format
  const cleaned = str.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function normalizeStatus(val: any): string {
  if (!val) return "vigente";
  const str = String(val).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, value] of Object.entries(statusMap)) {
    if (str.includes(key)) return value;
  }
  return "vigente";
}

function normalizeForMatch(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

export function DialogImportarContratos({ open, onOpenChange, contratoGestaoId, contratoGestaoNome, onImportado }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [linhas, setLinhas] = useState<LinhaContrato[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep("upload");
    setLinhas([]);
    setArquivos([]);
    setImportando(false);
    setProgresso(0);
  };

  const handlePlanilhaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      if (rows.length < 2) {
        toast.error("Planilha vazia ou sem dados");
        return;
      }

      // Skip header row
      const dataRows = rows.slice(1).filter(r => r.some(c => c != null && c !== ""));

      // Load all fornecedores for matching (incluindo inativos para contratos legados)
      const { data: fornecedoresDB } = await supabase
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia, cnpj");

      const parsed: LinhaContrato[] = dataRows.map(row => {
        const codigo = String(row[0] || "").trim();
        const fornecedorNome = String(row[1] || "").trim();
        const objeto = String(row[2] || "").trim();
        const dataAssinatura = parseDate(row[3]);
        const status = normalizeStatus(row[4]);
        const inicioVigencia = parseDate(row[5]);
        const fimVigencia = parseDate(row[6]);
        const valorInicial = parseNumber(row[7]);
        const valorAtual = parseNumber(row[8]);
        const nomeArquivo = String(row[9] || "").trim();

        // Match fornecedor - múltiplas estratégias
        let fornecedorId: string | null = null;
        if (fornecedorNome && fornecedoresDB) {
          const normalizedInput = normalizeForMatch(fornecedorNome);
          // 1. Match exato normalizado
          let match = fornecedoresDB.find(f => normalizeForMatch(f.razao_social) === normalizedInput);
          // 2. Match por nome fantasia exato
          if (!match) match = fornecedoresDB.find(f => f.nome_fantasia && normalizeForMatch(f.nome_fantasia) === normalizedInput);
          // 3. Match parcial - razão social contém input ou vice-versa
          if (!match) match = fornecedoresDB.find(f => {
            const nRS = normalizeForMatch(f.razao_social);
            return nRS.includes(normalizedInput) || normalizedInput.includes(nRS);
          });
          // 4. Match parcial - nome fantasia
          if (!match) match = fornecedoresDB.find(f => {
            if (!f.nome_fantasia) return false;
            const nNF = normalizeForMatch(f.nome_fantasia);
            return nNF.includes(normalizedInput) || normalizedInput.includes(nNF);
          });
          // 5. Match por CNPJ
          if (!match) match = fornecedoresDB.find(f => f.cnpj && f.cnpj.replace(/\D/g, "") === fornecedorNome.replace(/\D/g, ""));
          // 6. Match por palavras-chave (pelo menos 2 palavras em comum com 4+ chars)
          if (!match) {
            const inputWords = fornecedorNome.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
            if (inputWords.length >= 2) {
              match = fornecedoresDB.find(f => {
                const rsWords = f.razao_social.toLowerCase().split(/\s+/);
                const commonWords = inputWords.filter(w => rsWords.some(rw => rw.includes(w) || w.includes(rw)));
                return commonWords.length >= 2;
              });
            }
          }
          if (match) fornecedorId = match.id;
        }

        let erro: string | null = null;
        if (!codigo) erro = "Código obrigatório";
        else if (!objeto) erro = "Objeto obrigatório";

        return {
          codigo_interno: codigo,
          fornecedor_nome: fornecedorNome,
          objeto,
          data_assinatura: dataAssinatura,
          status,
          inicio_vigencia: inicioVigencia,
          fim_vigencia: fimVigencia,
          valor_inicial: valorInicial,
          valor_atual: valorAtual,
          nome_arquivo: nomeArquivo,
          fornecedor_id: fornecedorId,
          arquivo_match: null,
          erro,
        };
      });

      setLinhas(parsed);
      setStep("preview");
    } catch (err: any) {
      toast.error("Erro ao ler planilha: " + err.message);
    }
  };

  const handleArquivosUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setArquivos(files);

    // Match files to contracts by name
    setLinhas(prev => prev.map(linha => {
      if (!linha.nome_arquivo) return { ...linha, arquivo_match: null };
      const normalizedLinha = normalizeForMatch(linha.nome_arquivo);
      const normalizedCodigo = normalizeForMatch(linha.codigo_interno);
      const match = files.find(f => {
        const normalizedFile = normalizeForMatch(f.name.replace(/\.[^.]+$/, ""));
        return normalizedFile === normalizedLinha || 
               normalizedFile === normalizedCodigo ||
               normalizedFile.includes(normalizedLinha) ||
               normalizedLinha.includes(normalizedFile) ||
               normalizedFile.includes(normalizedCodigo) ||
               normalizedCodigo.includes(normalizedFile);
      });
      return { ...linha, arquivo_match: match || null };
    }));
  };

  const sanitizeFileName = (name: string) => {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  };

  const handleImportar = async () => {
    const validas = linhas.filter(l => !l.erro);
    if (validas.length === 0) {
      toast.error("Nenhuma linha válida para importar");
      return;
    }

    setImportando(true);
    setStep("importing");
    let importados = 0;
    let erros = 0;
    const { data: { user } } = await supabase.auth.getUser();

    for (let i = 0; i < validas.length; i++) {
      const linha = validas[i];
      setProgresso(Math.round(((i + 1) / validas.length) * 100));

      try {
        let urlArquivo: string | null = null;
        let storagePath: string | null = null;

        // Upload arquivo se tiver match
        if (linha.arquivo_match) {
          const safeName = sanitizeFileName(linha.arquivo_match.name);
          const path = `contratos/${contratoGestaoId}/${linha.codigo_interno}/${Date.now()}_${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("processo-anexos")
            .upload(path, linha.arquivo_match);
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("processo-anexos").getPublicUrl(path);
            urlArquivo = urlData.publicUrl;
            storagePath = path;
          }
        }

        const { error } = await supabase.from("contratos_terceiros").insert({
          contrato_gestao_id: contratoGestaoId,
          codigo_interno: linha.codigo_interno,
          objeto: linha.objeto,
          fornecedor_id: linha.fornecedor_id,
          data_assinatura: linha.data_assinatura || null,
          inicio_vigencia: linha.inicio_vigencia || null,
          fim_vigencia_atual: linha.fim_vigencia || null,
          status: linha.status,
          valor_inicial: linha.valor_inicial,
          valor_atual: linha.valor_atual,
          url_arquivo_principal: urlArquivo,
          storage_path_arquivo: storagePath,
          usuario_criador_id: user?.id,
        });

        if (error) throw error;
        importados++;
      } catch (err: any) {
        console.error(`Erro ao importar ${linha.codigo_interno}:`, err);
        erros++;
      }
    }

    await registrarAuditoria({
      acao: 'criação',
      entidade: 'Importação de Contratos',
      detalhes: {
        tipo: 'Importação em Lote',
        contrato_gestao: contratoGestaoNome,
        total_importados: importados,
        total_erros: erros,
      },
    });

    if (erros === 0) {
      toast.success(`${importados} contratos importados com sucesso!`);
    } else {
      toast.warning(`${importados} importados, ${erros} com erro`);
    }

    onImportado();
    onOpenChange(false);
    resetState();
  };

  const gerarPlanilhaModelo = () => {
    const wb = XLSX.utils.book_new();
    const header = [
      "Nº Contrato-Ano", "Fornecedor", "Objeto", "Data Assinatura",
      "Status", "Início Vigência", "Fim Vigência", "Valor Inicial",
      "Valor Atual", "Nome do Arquivo"
    ];
    const exemplo = [
      "001-2026", "Empresa Exemplo LTDA", "Prestação de serviços de limpeza",
      "01/01/2026", "Vigente", "01/01/2026", "31/12/2026",
      "120000", "150000", "001-2026"
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, exemplo]);
    ws["!cols"] = header.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, "Contratos");
    XLSX.writeFile(wb, "modelo_importacao_contratos.xlsx");
  };

  const totalValidas = linhas.filter(l => !l.erro).length;
  const totalComArquivo = linhas.filter(l => l.arquivo_match).length;
  const totalComFornecedor = linhas.filter(l => l.fornecedor_id).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importando) { onOpenChange(v); if (!v) resetState(); } }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Contratos via Planilha
          </DialogTitle>
          <DialogDescription>
            Importe contratos em lote a partir de uma planilha Excel. Fornecedores não cadastrados serão importados sem vínculo.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6 py-4">
            {/* Step 1: Planilha */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">1. Selecione a planilha Excel</Label>
                <Button variant="outline" size="sm" onClick={gerarPlanilhaModelo}>
                  <Download className="h-3 w-3 mr-1" />
                  Baixar Modelo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                A planilha deve conter as colunas: Nº Contrato-Ano, Fornecedor, Objeto, Data Assinatura, Status, Início Vigência, Fim Vigência, Valor Inicial, Valor Atual, Nome do Arquivo
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handlePlanilhaUpload}
                className="cursor-pointer"
              />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="flex flex-wrap gap-3">
              <Badge variant="outline" className="text-xs">
                {linhas.length} linhas lidas
              </Badge>
              <Badge className="bg-green-100 text-green-800 text-xs">
                <Check className="h-3 w-3 mr-1" />
                {totalValidas} válidas
              </Badge>
              {linhas.length - totalValidas > 0 && (
                <Badge className="bg-red-100 text-red-800 text-xs">
                  <X className="h-3 w-3 mr-1" />
                  {linhas.length - totalValidas} com erro
                </Badge>
              )}
              <Badge className="bg-blue-100 text-blue-800 text-xs">
                {totalComFornecedor} fornecedores vinculados
              </Badge>
              <Badge className="bg-purple-100 text-purple-800 text-xs">
                <FileText className="h-3 w-3 mr-1" />
                {totalComArquivo} arquivos vinculados
              </Badge>
            </div>

            {/* Upload PDFs */}
            <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
              <Label className="text-sm font-semibold">2. Selecione os arquivos PDF dos contratos (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Selecione múltiplos arquivos de uma vez. O sistema vincula automaticamente pelo nome do arquivo com o Nº do Contrato.
              </p>
              <Input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                multiple
                onChange={handleArquivosUpload}
                className="cursor-pointer"
              />
              {arquivos.length > 0 && (
                <p className="text-xs text-green-600">{arquivos.length} arquivos selecionados</p>
              )}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto max-h-[350px] overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nº Contrato</TableHead>
                    <TableHead className="text-xs">Fornecedor</TableHead>
                    <TableHead className="text-xs">Objeto</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Vigência</TableHead>
                    <TableHead className="text-xs">Valor Atual</TableHead>
                    <TableHead className="text-xs">Vínculo Forn.</TableHead>
                    <TableHead className="text-xs">Arquivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((linha, idx) => (
                    <TableRow key={idx} className={linha.erro ? "bg-red-50" : ""}>
                      <TableCell className="text-xs font-medium">{linha.codigo_interno}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{linha.fornecedor_nome || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{linha.objeto}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">{linha.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {linha.inicio_vigencia && linha.fim_vigencia
                          ? `${linha.inicio_vigencia.split("-").reverse().join("/")} - ${linha.fim_vigencia.split("-").reverse().join("/")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {linha.valor_atual > 0 ? `R$ ${linha.valor_atual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {linha.fornecedor_id
                          ? <Check className="h-3 w-3 text-green-600" />
                          : <span className="inline-flex" title="Fornecedor não encontrado no cadastro"><AlertTriangle className="h-3 w-3 text-amber-500" /></span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {linha.arquivo_match
                          ? <Check className="h-3 w-3 text-green-600" />
                          : linha.nome_arquivo ? <X className="h-3 w-3 text-red-400" /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-8 text-center space-y-4">
            <div className="text-lg font-semibold">Importando contratos...</div>
            <div className="w-full bg-muted rounded-full h-3">
              <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${progresso}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">{progresso}% concluído</p>
          </div>
        )}

        {step === "preview" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetState(); }}>
              Cancelar
            </Button>
            <Button onClick={handleImportar} disabled={totalValidas === 0}>
              <Upload className="h-4 w-4 mr-1" />
              Importar {totalValidas} Contratos
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
