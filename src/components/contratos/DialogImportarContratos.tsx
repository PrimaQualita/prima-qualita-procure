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
  fornecedor_nome_vinculado: string | null;
  objeto: string;
  data_assinatura: string;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string;
  valor_inicial: number;
  valor_atual: number;
  nome_arquivo: string;
  fornecedor_id: string | null;
  arquivo_match: File | null;
  erro: string | null;
  contrato_existente_id: string | null;
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
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const str = String(val).trim();
  const parts = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return "";
}

function parseNumber(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
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
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").trim();
}

// Palavras comuns que devem ser ignoradas no matching por palavras-chave
const STOP_WORDS = new Set([
  "ltda", "eireli", "ltda.", "sa", "s.a", "s.a.", "me", "epp", "ss",
  "de", "do", "da", "dos", "das", "e", "em", "para", "com", "por",
  "servicos", "comercio", "industria", "empresa", "grupo", "cia",
]);

function matchFornecedor(
  fornecedorNome: string,
  fornecedoresDB: { id: string; razao_social: string; nome_fantasia: string | null; cnpj: string }[]
): { id: string; nome: string } | null {
  if (!fornecedorNome || !fornecedoresDB?.length) return null;

  const normalizedInput = normalizeForMatch(fornecedorNome);
  if (!normalizedInput) return null;

  // 1. Match exato normalizado por razão social
  for (const f of fornecedoresDB) {
    if (normalizeForMatch(f.razao_social) === normalizedInput) {
      return { id: f.id, nome: f.razao_social };
    }
  }

  // 2. Match exato por nome fantasia
  for (const f of fornecedoresDB) {
    if (f.nome_fantasia && normalizeForMatch(f.nome_fantasia) === normalizedInput) {
      return { id: f.id, nome: f.nome_fantasia };
    }
  }

  // 3. Match por CNPJ (se o input parecer um CNPJ)
  const inputDigits = fornecedorNome.replace(/\D/g, "");
  if (inputDigits.length >= 11) {
    for (const f of fornecedoresDB) {
      if (f.cnpj && f.cnpj.replace(/\D/g, "") === inputDigits) {
        return { id: f.id, nome: f.razao_social };
      }
    }
  }

  // 4. Match por palavras-chave significativas (mais restritivo)
  // Exige que TODAS as palavras significativas do input (4+ chars, não stop words)
  // estejam presentes na razão social
  const inputWords = normalizedInput
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));

  if (inputWords.length >= 1) {
    let bestMatch: { id: string; nome: string; score: number } | null = null;

    for (const f of fornecedoresDB) {
      const rsNorm = normalizeForMatch(f.razao_social);
      const rsWords = rsNorm.split(/\s+/);

      // Contar quantas palavras do input estão na razão social
      const matchedWords = inputWords.filter(iw =>
        rsWords.some(rw => rw === iw || (rw.length >= 6 && iw.length >= 6 && (rw.startsWith(iw) || iw.startsWith(rw))))
      );

      // Exigir pelo menos 70% das palavras significativas
      const matchRatio = matchedWords.length / inputWords.length;
      if (matchRatio >= 0.7 && matchedWords.length >= 1) {
        const score = matchedWords.length * 10 + matchRatio * 5;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { id: f.id, nome: f.razao_social, score };
        }
      }

      // Tentar também com nome fantasia
      if (f.nome_fantasia) {
        const nfNorm = normalizeForMatch(f.nome_fantasia);
        const nfWords = nfNorm.split(/\s+/);
        const matchedNF = inputWords.filter(iw =>
          nfWords.some(rw => rw === iw || (rw.length >= 6 && iw.length >= 6 && (rw.startsWith(iw) || iw.startsWith(rw))))
        );
        const matchRatioNF = matchedNF.length / inputWords.length;
        if (matchRatioNF >= 0.7 && matchedNF.length >= 1) {
          const score = matchedNF.length * 10 + matchRatioNF * 5;
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { id: f.id, nome: f.nome_fantasia!, score };
          }
        }
      }
    }

    if (bestMatch) return { id: bestMatch.id, nome: bestMatch.nome };
  }

  return null;
}

export function DialogImportarContratos({ open, onOpenChange, contratoGestaoId, contratoGestaoNome, onImportado }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "importing">("upload");
  const [linhas, setLinhas] = useState<LinhaContrato[]>([]);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [filtroPreview, setFiltroPreview] = useState<"todos" | "novos" | "atualizados" | "erro" | "fornecedor" | "arquivo">("todos");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep("upload");
    setLinhas([]);
    setArquivos([]);
    setImportando(false);
    setProgresso(0);
    setFiltroPreview("todos");
  };

  const handlePlanilhaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as any[][];

      if (rows.length < 2) {
        toast.error("Planilha vazia ou sem dados");
        return;
      }

      const dataRows = rows.slice(1).filter(r => r.some(c => c != null && c !== ""));

      // Ler também com raw: true para valores numéricos/datas originais
      const rawRows = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }) as any[][]).slice(1);

      const { data: fornecedoresDB } = await supabase
        .from("fornecedores")
        .select("id, razao_social, nome_fantasia, cnpj");

      // Buscar contratos já existentes neste contrato de gestão
      const { data: contratosExistentes } = await supabase
        .from("contratos_terceiros")
        .select("id, codigo_interno")
        .eq("contrato_gestao_id", contratoGestaoId);

      const existentesMap = new Map<string, string>();
      (contratosExistentes || []).forEach(c => {
        existentesMap.set(c.codigo_interno.trim().toLowerCase(), c.id);
      });

      const codigoFormatoRegex = /^\d{3}-\d{2}$/;

      const parsed: LinhaContrato[] = dataRows.map((row, idx) => {
        const rawRow = rawRows[idx] || row;
        // Ler código: Excel pode interpretar "003-24" como data (Mar-24) ou número
        let codigoRaw = rawRow[0];
        let codigoText = String(row[0] || "").trim();
        let codigo = codigoText;
        
        // Se raw é número serial de data do Excel, o texto pode vir como "Mar-24" etc.
        // Tentar extrair de volta: se parece com mês abreviado-ano, converter
        const mesDateMatch = codigoText.match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|jan|feb|apr|may|aug|sep|oct|dec)-(\d{2})$/i);
        if (mesDateMatch) {
          const mesesMap: Record<string, string> = {
            jan: "001", feb: "002", mar: "003", apr: "004", may: "005", jun: "006",
            jul: "007", aug: "008", sep: "009", oct: "010", nov: "011", dec: "012",
            fev: "002", abr: "004", mai: "005", ago: "008", set: "009", out: "010", dez: "012",
          };
          const mesKey = mesDateMatch[1].toLowerCase();
          const num = mesesMap[mesKey] || mesDateMatch[1].padStart(3, "0");
          codigo = `${num}-${mesDateMatch[2]}`;
        }
        
        // Se veio como Date object do cellDates
        if (codigoRaw instanceof Date) {
          const m = String(codigoRaw.getMonth() + 1).padStart(3, "0");
          const y = String(codigoRaw.getFullYear()).slice(-2);
          codigo = `${m}-${y}`;
        }
        
        // Normalizar: "3-24" ou "03-24" → "003-24"
        const codigoMatch = codigo.match(/^(\d{1,3})-(\d{1,2})$/);
        if (codigoMatch) {
          codigo = codigoMatch[1].padStart(3, "0") + "-" + codigoMatch[2].padStart(2, "0");
        }
        
        console.log(`[Importação] Linha ${idx + 1}: raw=${JSON.stringify(codigoRaw)} text="${codigoText}" → "${codigo}"`);

        const fornecedorNome = String(row[1] || "").trim();
        const objeto = String(row[2] || "").trim();
        const dataAssinatura = parseDate(rawRow[3]);
        const status = normalizeStatus(row[4]);
        const inicioVigencia = parseDate(rawRow[5]);
        const fimVigencia = parseDate(rawRow[6]);
        const valorInicial = parseNumber(rawRow[7]);
        const valorAtual = parseNumber(rawRow[8]);
        const nomeArquivo = String(row[9] || "").trim();

        const matchResult = matchFornecedor(fornecedorNome, fornecedoresDB || []);

        let erro: string | null = null;
        if (!codigo) erro = "Código obrigatório";
        else if (!codigoFormatoRegex.test(codigo)) erro = `Formato inválido: "${codigo}" (use XXX-XX, ex: 001-26)`;
        else if (!objeto) erro = "Objeto obrigatório";

        const existeId = existentesMap.get(codigo.toLowerCase()) || null;

        return {
          codigo_interno: codigo,
          fornecedor_nome: fornecedorNome,
          fornecedor_nome_vinculado: matchResult?.nome || null,
          objeto,
          data_assinatura: dataAssinatura,
          status,
          inicio_vigencia: inicioVigencia,
          fim_vigencia: fimVigencia,
          valor_inicial: valorInicial,
          valor_atual: valorAtual,
          nome_arquivo: nomeArquivo,
          fornecedor_id: matchResult?.id || null,
          arquivo_match: null,
          erro,
          contrato_existente_id: existeId,
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

    setLinhas(prev => prev.map(linha => {
      if (!linha.nome_arquivo) return { ...linha, arquivo_match: null };
      const normalizedLinha = normalizeForMatch(linha.nome_arquivo).replace(/\s/g, "");
      const normalizedCodigo = normalizeForMatch(linha.codigo_interno).replace(/\s/g, "");
      const match = files.find(f => {
        const normalizedFile = normalizeForMatch(f.name.replace(/\.[^.]+$/, "")).replace(/\s/g, "");
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
    let atualizados = 0;
    let erros = 0;
    const { data: { user } } = await supabase.auth.getUser();

    for (let i = 0; i < validas.length; i++) {
      const linha = validas[i];
      setProgresso(Math.round(((i + 1) / validas.length) * 100));

      try {
        let urlArquivo: string | null = null;
        let storagePath: string | null = null;

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

        const dadosContrato: any = {
          contrato_gestao_id: contratoGestaoId,
          codigo_interno: linha.codigo_interno,
          objeto: linha.objeto,
          fornecedor_id: linha.fornecedor_id,
          fornecedor_nome_manual: linha.fornecedor_id ? null : (linha.fornecedor_nome || null),
          data_assinatura: linha.data_assinatura || null,
          inicio_vigencia: linha.inicio_vigencia || null,
          fim_vigencia_atual: linha.fim_vigencia || null,
          status: linha.status,
          valor_inicial: linha.valor_inicial,
          valor_atual: linha.valor_atual,
        };

        if (urlArquivo) {
          dadosContrato.url_arquivo_principal = urlArquivo;
          dadosContrato.storage_path_arquivo = storagePath;
        }

        if (linha.contrato_existente_id) {
          // Atualizar contrato existente (nunca altera codigo_interno)
          const { codigo_interno, contrato_gestao_id: _, ...dadosUpdate } = dadosContrato;
          const { error } = await supabase
            .from("contratos_terceiros")
            .update(dadosUpdate)
            .eq("id", linha.contrato_existente_id);
          if (error) throw error;
          atualizados++;
        } else {
          // Inserir novo contrato
          dadosContrato.usuario_criador_id = user?.id;
          const { error } = await supabase
            .from("contratos_terceiros")
            .insert(dadosContrato);
          if (error) throw error;
          importados++;
        }
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
        total_novos: importados,
        total_atualizados: atualizados,
        total_erros: erros,
      },
    });

    const partes: string[] = [];
    if (importados > 0) partes.push(`${importados} novos`);
    if (atualizados > 0) partes.push(`${atualizados} atualizados`);
    if (erros > 0) partes.push(`${erros} com erro`);

    if (erros === 0) {
      toast.success(`Contratos processados: ${partes.join(", ")}`);
    } else {
      toast.warning(`Contratos processados: ${partes.join(", ")}`);
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
      "001-26", "Empresa Exemplo LTDA", "Prestação de serviços de limpeza",
      "01/01/2026", "Vigente", "01/01/2026", "31/12/2026",
      "120000", "150000", "001-26"
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, exemplo]);
    ws["!cols"] = header.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, "Contratos");
    XLSX.writeFile(wb, "modelo_importacao_contratos.xlsx");
  };

  const totalValidas = linhas.filter(l => !l.erro).length;
  const totalComArquivo = linhas.filter(l => l.arquivo_match).length;
  const totalComFornecedor = linhas.filter(l => l.fornecedor_id).length;
  const totalExistentes = linhas.filter(l => !l.erro && l.contrato_existente_id).length;
  const totalNovos = totalValidas - totalExistentes;

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
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={`text-xs cursor-pointer transition-all ${filtroPreview === "todos" ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`}
                onClick={() => setFiltroPreview("todos")}
              >
                {linhas.length} linhas lidas
              </Badge>
              <Badge
                className={`bg-green-100 text-green-800 text-xs cursor-pointer transition-all ${filtroPreview === "novos" ? "ring-2 ring-green-500" : "opacity-60 hover:opacity-100"}`}
                onClick={() => setFiltroPreview(filtroPreview === "novos" ? "todos" : "novos")}
              >
                <Check className="h-3 w-3 mr-1" />
                {totalNovos} novos
              </Badge>
              {totalExistentes > 0 && (
                <Badge
                  className={`bg-amber-100 text-amber-800 text-xs cursor-pointer transition-all ${filtroPreview === "atualizados" ? "ring-2 ring-amber-500" : "opacity-60 hover:opacity-100"}`}
                  onClick={() => setFiltroPreview(filtroPreview === "atualizados" ? "todos" : "atualizados")}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {totalExistentes} serão atualizados
                </Badge>
              )}
              {linhas.length - totalValidas > 0 && (
                <Badge
                  className={`bg-red-100 text-red-800 text-xs cursor-pointer transition-all ${filtroPreview === "erro" ? "ring-2 ring-red-500" : "opacity-60 hover:opacity-100"}`}
                  onClick={() => setFiltroPreview(filtroPreview === "erro" ? "todos" : "erro")}
                >
                  <X className="h-3 w-3 mr-1" />
                  {linhas.length - totalValidas} com erro
                </Badge>
              )}
              <Badge
                className={`bg-blue-100 text-blue-800 text-xs cursor-pointer transition-all ${filtroPreview === "fornecedor" ? "ring-2 ring-blue-500" : "opacity-60 hover:opacity-100"}`}
                onClick={() => setFiltroPreview(filtroPreview === "fornecedor" ? "todos" : "fornecedor")}
              >
                {totalComFornecedor} fornecedores vinculados
              </Badge>
              <Badge
                className={`bg-purple-100 text-purple-800 text-xs cursor-pointer transition-all ${filtroPreview === "arquivo" ? "ring-2 ring-purple-500" : "opacity-60 hover:opacity-100"}`}
                onClick={() => setFiltroPreview(filtroPreview === "arquivo" ? "todos" : "arquivo")}
              >
                <FileText className="h-3 w-3 mr-1" />
                {totalComArquivo} arquivos vinculados
              </Badge>
            </div>

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

            <div className="overflow-x-auto max-h-[350px] overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nº Contrato</TableHead>
                    <TableHead className="text-xs">Fornecedor (Planilha)</TableHead>
                    <TableHead className="text-xs">Fornecedor (Vinculado)</TableHead>
                    <TableHead className="text-xs">Objeto</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Vigência</TableHead>
                    <TableHead className="text-xs">Valor Atual</TableHead>
                    <TableHead className="text-xs">Arquivo</TableHead>
                    <TableHead className="text-xs">Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas
                    .map((linha, idx) => ({ linha, idx }))
                    .filter(({ linha }) => {
                      switch (filtroPreview) {
                        case "novos": return !linha.erro && !linha.contrato_existente_id;
                        case "atualizados": return !linha.erro && !!linha.contrato_existente_id;
                        case "erro": return !!linha.erro;
                        case "fornecedor": return !!linha.fornecedor_id;
                        case "arquivo": return !!linha.arquivo_match;
                        default: return true;
                      }
                    })
                    .map(({ linha, idx }) => (
                    <TableRow key={idx} className={linha.erro ? "bg-red-50" : linha.contrato_existente_id ? "bg-amber-50/50" : ""}>
                      <TableCell className="text-xs font-medium">
                        {linha.codigo_interno}
                        {!linha.erro && linha.contrato_existente_id && (
                          <span className="ml-1 text-[9px] text-amber-600 font-normal">(atualizar)</span>
                        )}
                        {!linha.erro && !linha.contrato_existente_id && (
                          <span className="ml-1 text-[9px] text-green-600 font-normal">(novo)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px]">
                        <span className="block truncate" title={linha.fornecedor_nome}>
                          {linha.fornecedor_nome || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px]">
                        {linha.fornecedor_id ? (
                          <span className="block truncate text-green-700 font-medium" title={linha.fornecedor_nome_vinculado || ""}>
                            ✅ {linha.fornecedor_nome_vinculado}
                          </span>
                        ) : (
                          <span className="text-amber-600 text-[10px]">
                            ⚠ Não encontrado
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] whitespace-normal text-justify">{linha.objeto}</TableCell>
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
                        {linha.arquivo_match
                          ? <Check className="h-3 w-3 text-green-600" />
                          : linha.nome_arquivo ? <X className="h-3 w-3 text-red-400" /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {linha.erro ? (
                          <span className="text-red-600 font-medium">⚠ {linha.erro}</span>
                        ) : linha.contrato_existente_id ? (
                          <span className="text-amber-600">Será atualizado</span>
                        ) : (
                          <span className="text-green-600">Novo contrato</span>
                        )}
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
              Processar {totalValidas} Contratos {totalExistentes > 0 ? `(${totalNovos} novos, ${totalExistentes} atualizações)` : ""}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
