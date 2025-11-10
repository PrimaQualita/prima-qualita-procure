import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    
    // Decode base64
    const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
    
    // Convert to text (simple extraction - in production, use proper PDF parser)
    const text = new TextDecoder().decode(pdfBytes);
    
    // Extract dates based on document type
    let dataValidade: string | null = null;
    
    // Regex patterns for different date formats
    const datePatterns = [
      /(\d{2})\/(\d{2})\/(\d{4})/g, // DD/MM/YYYY
      /(\d{2})-(\d{2})-(\d{4})/g,   // DD-MM-YYYY
      /(\d{4})-(\d{2})-(\d{2})/g,   // YYYY-MM-DD
    ];
    
    const dates: Date[] = [];
    
    // Extract all dates from text
    for (const pattern of datePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        let day: number, month: number, year: number;
        
        if (match[0].includes('-') && match[1].length === 4) {
          // YYYY-MM-DD format
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          // DD/MM/YYYY or DD-MM-YYYY format
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
        }
        
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
          dates.push(new Date(year, month - 1, day));
        }
      }
    }
    
    // For CRF FGTS, get the latest date
    if (tipoDocumento === 'crf_fgts' && dates.length > 0) {
      const latestDate = dates.reduce((latest, current) => 
        current > latest ? current : latest
      );
      dataValidade = latestDate.toISOString().split('T')[0];
    } else if (dates.length > 0) {
      // For other documents, try to find the validity date
      // Usually appears after keywords like "validade", "válido até", etc.
      const validadeKeywords = ['validade', 'válido até', 'vencimento', 'expira em'];
      
      for (const keyword of validadeKeywords) {
        const keywordIndex = text.toLowerCase().indexOf(keyword);
        if (keywordIndex !== -1) {
          // Find the first date after the keyword
          const textAfterKeyword = text.substring(keywordIndex);
          for (const pattern of datePatterns) {
            const match = textAfterKeyword.match(pattern);
            if (match) {
              let day: number, month: number, year: number;
              
              if (match[0].includes('-') && match[0].length > 8) {
                // YYYY-MM-DD format
                const parts = match[0].split('-');
                year = parseInt(parts[0]);
                month = parseInt(parts[1]);
                day = parseInt(parts[2]);
              } else {
                // DD/MM/YYYY or DD-MM-YYYY format
                const parts = match[0].split(/[/-]/);
                day = parseInt(parts[0]);
                month = parseInt(parts[1]);
                year = parseInt(parts[2]);
              }
              
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                break;
              }
            }
          }
          if (dataValidade) break;
        }
      }
      
      // If no validity date found, use the latest date
      if (!dataValidade && dates.length > 0) {
        const latestDate = dates.reduce((latest, current) => 
          current > latest ? current : latest
        );
        dataValidade = latestDate.toISOString().split('T')[0];
      }
    }
    
    console.log('Data de validade extraída:', dataValidade);
    
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