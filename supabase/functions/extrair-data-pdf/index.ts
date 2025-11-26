import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getDocument } from 'https://esm.sh/pdfjs-serverless@0.3.2';
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função auxiliar para verificar se há padrões de data no texto
function hasDatePattern(text: string): boolean {
  const datePatterns = [
    /\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}/,  // DD/MM/YYYY
    /\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2}/,  // YYYY-MM-DD
    /\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i, // DD de Mês de YYYY
  ];
  return datePatterns.some(pattern => pattern.test(text));
}

// Função auxiliar para extrair intervalo de datas (CRF FGTS)
function extractDateRange(text: string): string | null {
  // Padrão para intervalo: DD/MM/YYYY a DD/MM/YYYY ou DD/MM/YYYY A DD/MM/YYYY
  const intervalPatterns = [
    /(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*[aA]\s*(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g,
    /(\d{2})\/(\d{2})\/(\d{4})\s+[aA]\s+(\d{2})\/(\d{2})\/(\d{4})/g,
  ];
  
  for (const pattern of intervalPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      // Pegar a SEGUNDA data (data final do período)
      const day = parseInt(match[4]);
      const month = parseInt(match[5]);
      const year = parseInt(match[6]);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

// Função auxiliar para extrair data explícita de validade
function extractExplicitDate(text: string): string | null {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  
  // Padrões de validade explícita
  const validadePatterns = [
    /[Vv]alidade[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
    /[Vv]álida?\s+até[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
    /[Vv]encimento[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
    /[Vv]áli[do]a?\s+por.*?até[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/,
  ];
  
  for (const pattern of validadePatterns) {
    const match = pattern.exec(normalizedText);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]);
      const year = parseInt(match[3]);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

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
    
    // PRIMEIRO: Tentar extrair data de intervalo (CRF FGTS) - sempre pega a segunda data
    const dateRangeResult = extractDateRange(pdfText);
    if (dateRangeResult) {
      console.log('✅ Data de intervalo encontrada (segunda data):', dateRangeResult);
      return new Response(
        JSON.stringify({ dataValidade: dateRangeResult, isScanned: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // SEGUNDO: Tentar extrair data de validade explícita
    const explicitDateResult = extractExplicitDate(pdfText);
    if (explicitDateResult) {
      console.log('✅ Data de validade explícita encontrada:', explicitDateResult);
      return new Response(
        JSON.stringify({ dataValidade: explicitDateResult, isScanned: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Verificar se é PDF digitalizado SEM dados de data
    // Só marca como digitalizado se o texto for muito curto E não tiver padrão de data
    const hasDate = hasDatePattern(pdfText);
    if (pdfText.trim().length < 30 && !hasDate) {
      console.log('⚠️ PDF digitalizado detectado (sem texto extraível) - retornando null para preenchimento manual');
      
      return new Response(
        JSON.stringify({ 
          dataValidade: null,
          isScanned: true,
          message: 'PDF digitalizado detectado. Por favor, insira a data de validade manualmente.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // TERCEIRO: Usar IA para interpretar o texto completo e extrair a data de validade
    console.log('🤖 Usando IA para interpretar a certidão...');
    
    try {
      const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY não configurada');
      }
      
      const promptAnalise = `Você é um especialista em analisar certidões brasileiras (CNDs, CNDT, CRF FGTS, etc.).

Analise o texto da certidão abaixo e extraia a DATA DE VALIDADE.

A data de validade pode estar em diversos formatos:
1. Data explícita: "válida até DD/MM/AAAA" ou "vencimento: DD/MM/AAAA" ou "Validade: DD/MM/AAAA"
2. Período relativo: "válida por X dias a partir da emissão" - neste caso, encontre a data de emissão e calcule
3. Intervalo de datas (CRF FGTS): "DD/MM/AAAA a DD/MM/AAAA" - pegue SEMPRE a SEGUNDA/ÚLTIMA data (data final do período)
4. Outros formatos que indicam validade

MUITO IMPORTANTE:
- Para CRF FGTS ou qualquer documento com intervalo de datas (ex: "10/02/2026 a 09/03/2026"), pegue SEMPRE a ÚLTIMA data do período (09/03/2026 neste exemplo)
- Se houver "X dias a partir da emissão", encontre a data de emissão (geralmente no final: "Cidade-UF, DD de Mês de AAAA") e CALCULE a data de validade
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
      let resultText = aiResult.choices[0].message.content;
      
      // Remover markdown code blocks se existirem
      resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
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
    
    // QUARTO: Fallback - Procurar por validade relativa (ex: "válida por X dias")
    const monthNames: { [key: string]: number } = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
      'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
      'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
      'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
      'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
    };
    
    const validadeRelativaPattern = /válida?\s+por\s+(\d+)\s*\(?\w*\)?\s*dias?\s+a\s+partir\s+da\s+data\s+de\s+emissão/gi;
    const matchRelativa = validadeRelativaPattern.exec(pdfText);
    
    if (matchRelativa) {
      const diasValidade = parseInt(matchRelativa[1]);
      console.log(`📝 Encontrado prazo de validade: ${diasValidade} dias`);
      
      // Procurar pela data de emissão no documento
      // Estratégia: procurar padrão "Cidade-UF, DD de MÊS de AAAA" ou pegar a última data do documento
      const emissaoPatterns = [
        /(\w+(?:-\w+)?),\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
        /emitida?\s+em[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/gi,
        /emissão[:\s]+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/gi,
      ];
      
      let dataEmissaoEncontrada: Date | null = null;
      
      for (const pattern of emissaoPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(pdfText)) !== null) {
          let dia: number, mes: number, ano: number;
          
          if (match[0].includes(' de ')) {
            // Formato: Cidade, DD de MÊS de AAAA
            dia = parseInt(match[2]);
            const mesNome = match[3].toLowerCase();
            ano = parseInt(match[4]);
            mes = monthNames[mesNome] || 0;
          } else {
            // Formato: DD/MM/YYYY
            dia = parseInt(match[1]);
            mes = parseInt(match[2]);
            ano = parseInt(match[3]);
          }
          
          if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && ano >= 2020) {
            dataEmissaoEncontrada = new Date(ano, mes - 1, dia);
          }
        }
      }
      
      // Se não encontrou com padrões específicos, pegar a última data do documento
      if (!dataEmissaoEncontrada) {
        const todasDatas = pdfText.matchAll(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g);
        const datasArray = Array.from(todasDatas);
        
        if (datasArray.length > 0) {
          const ultimaData = datasArray[datasArray.length - 1];
          const dia = parseInt(ultimaData[1]);
          const mes = parseInt(ultimaData[2]);
          const ano = parseInt(ultimaData[3]);
          
          if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && ano >= 2020) {
            dataEmissaoEncontrada = new Date(ano, mes - 1, dia);
            console.log(`📝 Usando última data do documento como emissão: ${dia}/${mes}/${ano}`);
          }
        }
      }
      
      if (dataEmissaoEncontrada) {
        const dataValidadeCalc = new Date(dataEmissaoEncontrada);
        dataValidadeCalc.setDate(dataValidadeCalc.getDate() + diasValidade);
        
        dataValidade = `${dataValidadeCalc.getFullYear()}-${String(dataValidadeCalc.getMonth() + 1).padStart(2, '0')}-${String(dataValidadeCalc.getDate()).padStart(2, '0')}`;
        
        console.log(`✅ Data de emissão: ${dataEmissaoEncontrada.toLocaleDateString('pt-BR')}`);
        console.log(`✅ Data de validade calculada: ${dataValidade} (${diasValidade} dias após emissão)`);
        
        return new Response(
          JSON.stringify({ dataValidade, isScanned: false }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // QUINTO: Procurar qualquer data próxima a palavras-chave de validade
    const validadeKeywords = ['validade', 'válida', 'valida', 'vencimento', 'vigência', 'vigencia'];
    
    for (const keyword of validadeKeywords) {
      const keywordIndex = pdfText.toLowerCase().indexOf(keyword.toLowerCase());
      if (keywordIndex !== -1) {
        const context = pdfText.substring(keywordIndex, keywordIndex + 200);
        
        // Verificar se há intervalo de datas no contexto
        const intervalResult = extractDateRange(context);
        if (intervalResult) {
          console.log(`✅ Intervalo de datas encontrado próximo a "${keyword}":`, intervalResult);
          return new Response(
            JSON.stringify({ dataValidade: intervalResult, isScanned: false }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Procurar data simples no contexto
        const datePattern = /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/;
        const match = datePattern.exec(context);
        
        if (match) {
          const day = parseInt(match[1]);
          const month = parseInt(match[2]);
          const year = parseInt(match[3]);
          
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
            dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            console.log(`✅ Data encontrada próxima a "${keyword}":`, dataValidade);
            break;
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
