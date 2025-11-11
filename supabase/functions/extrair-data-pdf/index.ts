import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getDocument } from 'https://esm.sh/pdfjs-serverless@0.3.2';
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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
    
    let dataValidade: string | null = null;
    
    // Decode base64 to binary
    const binaryString = atob(pdfBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Parse PDF using pdfjs-serverless
    const doc = await getDocument(bytes).promise;
    const numPages = doc.numPages;
    
    console.log('Total de páginas:', numPages);
    
    // Extract text from all pages
    let pdfText = '';
    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      pdfText += pageText + ' ';
    }
    
    console.log('Texto extraído do PDF (primeiros 500 caracteres):', pdfText.substring(0, 500));
    console.log('Tamanho total do texto:', pdfText.length);
    
    // Se o texto extraído for muito pequeno (< 50 caracteres), é PDF digitalizado
    // Usar Lovable AI Vision para OCR primeiro para extrair o texto, depois processar
    if (pdfText.trim().length < 50) {
      console.log('⚠️ PDF digitalizado detectado. Usando Lovable AI Vision para OCR...');
      
      try {
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          throw new Error('LOVABLE_API_KEY não configurada');
        }
        
        // Criar data URL do PDF
        const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;
        
        const promptOCR = `Você é um especialista em ler certidões brasileiras escaneadas.

Analise esta certidão e extraia TODO o texto visível. Transcreva exatamente como está escrito, incluindo datas, números, nomes de campos, etc.

Retorne APENAS o texto extraído, sem comentários ou formatação adicional.`;

        console.log('Chamando Lovable AI para OCR do texto...');
        const ocrResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-pro',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: promptOCR },
                  { 
                    type: 'image_url',
                    image_url: { url: pdfDataUrl }
                  }
                ]
              }
            ],
            max_completion_tokens: 2000,
          }),
        });

        if (!ocrResponse.ok) {
          const errorText = await ocrResponse.text();
          console.error('Erro na API Lovable AI (OCR):', errorText);
          throw new Error(`Erro AI OCR: ${ocrResponse.status}`);
        }

        const ocrResult = await ocrResponse.json();
        pdfText = ocrResult.choices[0].message.content;
        console.log('✅ Texto extraído via OCR:', pdfText.substring(0, 500));
        console.log('Tamanho do texto OCR:', pdfText.length);
      } catch (ocrError) {
        console.error('❌ Erro ao aplicar OCR:', ocrError);
        console.log('Continuando com lógica de fallback');
      }
    }
    
    // Normalizar texto
    const normalizedText = pdfText
      .replace(/(\d)\s+(\d)/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
    
    const datePatterns = [
      /(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/g,
      /(\d{2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
      /(\d{4})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{2})/g,
    ];
    
    const monthNames: { [key: string]: number } = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
      'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
      'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
      'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
      'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
    };
    
    // Padrões explícitos de validade
    const validadeExplicitaPatterns = [
      /válida?\s+até[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
      /valida?\s+ate[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
      /vencimento[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
    ];
    
    for (const pattern of validadeExplicitaPatterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(normalizedText);
      if (!match) {
        pattern.lastIndex = 0;
        match = pattern.exec(pdfText);
      }
      
      if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
          dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          console.log(`✅ Data de validade EXPLÍCITA encontrada: ${dataValidade}`);
          break;
        }
      }
    }
    
    // Se não encontrou, procurar por contexto de validade
    if (!dataValidade) {
      const validadeKeywords = ['validade', 'válida até', 'valida ate', 'vencimento'];
      
      for (const keyword of validadeKeywords) {
        const keywordIndex = pdfText.toLowerCase().indexOf(keyword.toLowerCase());
        if (keywordIndex !== -1) {
          const context = pdfText.substring(keywordIndex, keywordIndex + 200);
          
          // CRF FGTS - intervalo de datas
          if (tipoDocumento === 'crf_fgts') {
            const intervalPattern = /(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+a\s+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i;
            const intervalMatch = intervalPattern.exec(context);
            
            if (intervalMatch) {
              const day = parseInt(intervalMatch[4]);
              const month = parseInt(intervalMatch[5]);
              const year = parseInt(intervalMatch[6]);
              
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
                dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                console.log('✅ CRF FGTS - Data final do intervalo:', dataValidade);
                break;
              }
            }
          }
          
          // Extrair primeira data do contexto
          if (!dataValidade) {
            for (const pattern of datePatterns) {
              pattern.lastIndex = 0;
              const match = pattern.exec(context);
              
              if (match) {
                let day: number, month: number, year: number;
                
                if (match[0].toLowerCase().includes('de') && isNaN(parseInt(match[2]))) {
                  day = parseInt(match[1]);
                  month = monthNames[match[2].toLowerCase().trim()] || 0;
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
                  dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  console.log(`✅ Data encontrada próxima a "${keyword}":`, dataValidade);
                  break;
                }
              }
            }
            if (dataValidade) break;
          }
        }
      }
    }
    
    console.log('📅 Data de validade final extraída:', dataValidade);
    
    return new Response(
      JSON.stringify({ dataValidade }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ Erro ao extrair data do PDF:', error);
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
