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
    
    // Para PDFs com pouco texto (digitalizados), retornar para preenchimento manual
    if (pdfText.trim().length < 50) {
      console.log('⚠️ PDF digitalizado detectado - retornando null para preenchimento manual');
      
      return new Response(
        JSON.stringify({ 
          dataValidade: null,
          isScanned: true,
          message: 'PDF digitalizado detectado. Por favor, insira a data de validade manualmente.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Usar IA para interpretar o texto completo e extrair a data de validade
    console.log('🤖 Usando IA para interpretar a certidão...');
    
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY não configurada');
      }
      
      const promptAnalise = `Você é um especialista em analisar certidões brasileiras (CNDs, CNDT, CRF FGTS, etc.).

Analise o texto da certidão abaixo e extraia a DATA DE VALIDADE.

A data de validade pode estar em diversos formatos:
1. Data explícita: "válida até DD/MM/AAAA" ou "vencimento: DD/MM/AAAA"
2. Período relativo: "válida por X dias a partir da emissão" - neste caso, encontre a data de emissão e calcule
3. Intervalo de datas (CRF FGTS): "DD/MM/AAAA a DD/MM/AAAA" - pegue sempre a ÚLTIMA data
4. Outros formatos que indicam validade

IMPORTANTE:
- Se houver "X dias a partir da emissão", encontre a data de emissão (geralmente no final: "Cidade-UF, DD de Mês de AAAA") e CALCULE a data de validade
- Para CRF FGTS com intervalo, pegue sempre a data FINAL do período
- Retorne APENAS a data de validade final no formato YYYY-MM-DD
- Se não encontrar validade, retorne null

TEXTO DA CERTIDÃO:
${pdfText}

Retorne APENAS no formato JSON: {"dataValidade": "YYYY-MM-DD"} ou {"dataValidade": null}`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: promptAnalise }
          ],
          response_format: { type: "json_object" }
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Erro na API Lovable AI:', errorText);
        throw new Error(`Erro AI: ${aiResponse.status}`);
      }

      const aiResult = await aiResponse.json();
      const resultText = aiResult.choices[0].message.content;
      const resultado = JSON.parse(resultText);
      
      console.log('✅ IA retornou:', resultado);
      
      if (resultado.dataValidade) {
        console.log('📅 Data de validade extraída pela IA:', resultado.dataValidade);
        
        return new Response(
          JSON.stringify({ dataValidade: resultado.dataValidade, isScanned: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (aiError) {
      console.error('❌ Erro ao usar IA:', aiError);
      console.log('Tentando com lógica de fallback...');
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
    
    // Primeiro, procurar por validade relativa (ex: "válida por X dias")
    const validadeRelativaPattern = /válida?\s+por\s+(\d+)\s*\(?\w*\)?\s*dias?\s+a\s+partir\s+da\s+data\s+de\s+emissão/gi;
    const matchRelativa = validadeRelativaPattern.exec(pdfText);
    
    if (matchRelativa) {
      const diasValidade = parseInt(matchRelativa[1]);
      console.log(`📝 Encontrado prazo de validade: ${diasValidade} dias`);
      
      // Procurar pela data de emissão no documento
      // Padrão comum: "Cidade-UF, DD de MÊS de AAAA"
      const emissaoPattern = /(\w+(?:-\w+)?),\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi;
      const matchEmissao = emissaoPattern.exec(pdfText);
      
      if (matchEmissao) {
        const dia = parseInt(matchEmissao[2]);
        const mesNome = matchEmissao[3].toLowerCase();
        const ano = parseInt(matchEmissao[4]);
        const mes = monthNames[mesNome];
        
        if (mes && dia >= 1 && dia <= 31 && ano >= 2020) {
          // Calcular data de validade somando os dias
          const dataEmissao = new Date(ano, mes - 1, dia);
          const dataValidade = new Date(dataEmissao);
          dataValidade.setDate(dataValidade.getDate() + diasValidade);
          
          const validadeFormatada = `${dataValidade.getFullYear()}-${String(dataValidade.getMonth() + 1).padStart(2, '0')}-${String(dataValidade.getDate()).padStart(2, '0')}`;
          
          console.log(`✅ Data de emissão: ${dia}/${mes}/${ano}`);
          console.log(`✅ Data de validade calculada: ${validadeFormatada} (${diasValidade} dias após emissão)`);
          
          return new Response(
            JSON.stringify({ dataValidade: validadeFormatada, isScanned: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }
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
      JSON.stringify({ dataValidade, isScanned: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ Erro ao extrair data do PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage, dataValidade: null, isScanned: false }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
