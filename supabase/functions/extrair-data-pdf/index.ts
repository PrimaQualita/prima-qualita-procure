import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { readAll } from "https://deno.land/std@0.168.0/streams/read_all.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, tipoDocumento } = await req.json();
    
    console.log('Recebido PDF para processamento, tipo:', tipoDocumento);
    
    // Decode base64 to binary
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Extract text from PDF (simple extraction - gets text content)
    const pdfText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    
    console.log('Texto extraído do PDF (primeiros 500 caracteres):', pdfText.substring(0, 500));
    
    let dataValidade: string | null = null;
    
    // Padrões de data mais robustos
    const datePatterns = [
      // DD/MM/YYYY
      /(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})/g,
      // DD de MMMM de YYYY (por extenso)
      /(\d{2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
      // YYYY-MM-DD
      /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/g,
    ];
    
    const monthNames: { [key: string]: number } = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'abril': 4,
      'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
      'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
      'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
      'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
    };
    
    const extractedDates: Date[] = [];
    
    // Palavras-chave que indicam validade
    const validadeKeywords = [
      'validade', 'válido até', 'vencimento', 'válida até',
      'expira em', 'prazo', 'vigência', 'data de vencimento'
    ];
    
    // Procurar por datas próximas às palavras-chave de validade
    for (const keyword of validadeKeywords) {
      const keywordIndex = pdfText.toLowerCase().indexOf(keyword.toLowerCase());
      if (keywordIndex !== -1) {
        // Pegar um contexto de 200 caracteres após a palavra-chave
        const context = pdfText.substring(keywordIndex, keywordIndex + 200);
        console.log(`Contexto encontrado para "${keyword}":`, context);
        
        // Tentar extrair data do contexto
        for (const pattern of datePatterns) {
          pattern.lastIndex = 0; // Reset regex
          const match = pattern.exec(context);
          if (match) {
            console.log('Match encontrado:', match[0]);
            let day: number, month: number, year: number;
            
            // Verificar se é data por extenso
            if (match[0].includes('de') && isNaN(parseInt(match[2]))) {
              day = parseInt(match[1]);
              const monthName = match[2].toLowerCase().trim();
              month = monthNames[monthName] || 0;
              year = parseInt(match[3]);
            } else if (match[1].length === 4) {
              // YYYY-MM-DD
              year = parseInt(match[1]);
              month = parseInt(match[2]);
              day = parseInt(match[3]);
            } else {
              // DD/MM/YYYY
              day = parseInt(match[1]);
              month = parseInt(match[2]);
              year = parseInt(match[3]);
            }
            
            console.log('Data extraída:', { day, month, year });
            
            // Validar data
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
              const date = new Date(year, month - 1, day);
              extractedDates.push(date);
              console.log('Data válida adicionada:', date.toISOString());
              
              // Se encontrou uma data próxima à palavra-chave, usar essa
              dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              break;
            }
          }
        }
        if (dataValidade) break;
      }
    }
    
    // Se não encontrou data com palavras-chave, extrair todas as datas e pegar a mais recente no futuro
    if (!dataValidade) {
      console.log('Não encontrou data com palavras-chave, extraindo todas as datas...');
      
      for (const pattern of datePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(pdfText)) !== null) {
          let day: number, month: number, year: number;
          
          if (match[0].includes('de') && isNaN(parseInt(match[2]))) {
            day = parseInt(match[1]);
            const monthName = match[2].toLowerCase().trim();
            month = monthNames[monthName] || 0;
            year = parseInt(match[3]);
          } else if (match[1].length === 4) {
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            day = parseInt(match[3]);
          } else {
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = parseInt(match[3]);
          }
          
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
            const date = new Date(year, month - 1, day);
            extractedDates.push(date);
          }
        }
      }
      
      console.log(`Total de datas extraídas: ${extractedDates.length}`);
      
      // Para CRF FGTS, pegar sempre a data mais recente
      if (tipoDocumento === 'crf_fgts' && extractedDates.length > 0) {
        const latestDate = extractedDates.reduce((latest, current) => 
          current > latest ? current : latest
        );
        dataValidade = latestDate.toISOString().split('T')[0];
        console.log('CRF FGTS - Data mais recente:', dataValidade);
      } else if (extractedDates.length > 0) {
        // Para outros documentos, pegar a data mais recente que está no futuro
        const now = new Date();
        const futureDates = extractedDates.filter(d => d > now);
        
        if (futureDates.length > 0) {
          const nextDate = futureDates.reduce((nearest, current) => 
            current < nearest ? current : nearest
          );
          dataValidade = nextDate.toISOString().split('T')[0];
          console.log('Data futura mais próxima:', dataValidade);
        } else {
          // Se não há datas futuras, pegar a mais recente
          const latestDate = extractedDates.reduce((latest, current) => 
            current > latest ? current : latest
          );
          dataValidade = latestDate.toISOString().split('T')[0];
          console.log('Data mais recente (passada):', dataValidade);
        }
      }
    }
    
    console.log('Data de validade final extraída:', dataValidade);
    
    return new Response(
      JSON.stringify({ dataValidade }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Erro ao extrair data do PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage, dataValidade: null }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});