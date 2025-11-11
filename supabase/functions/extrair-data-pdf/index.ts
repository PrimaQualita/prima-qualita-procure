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
    
    console.log('Texto extraído do PDF (primeiros 1000 caracteres):', pdfText.substring(0, 1000));
    console.log('Tamanho total do texto:', pdfText.length);
    
    // Se o texto extraído for muito pequeno (< 50 caracteres), é PDF digitalizado
    // Usar Lovable AI Vision para OCR
    if (pdfText.trim().length < 50) {
      console.log('⚠️ PDF digitalizado detectado. Usando Lovable AI Vision para OCR...');
      
      try {
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          throw new Error('LOVABLE_API_KEY não configurada');
        }
        
        // Usar o PDF base64 diretamente como imagem
        const prompt = `Você é um especialista em extrair informações de certidões brasileiras.

Analise esta imagem de certidão e extraia:
1. A data de validade (procure por "VÁLIDA ATÉ", "VALIDADE", "VENCIMENTO", etc.)
2. Se não houver data explícita mas mencionar "válida por X dias", encontre a data de emissão e calcule
3. Para CRF FGTS, se houver intervalo de datas (ex: "25/10/2025 a 23/11/2025"), retorne a SEGUNDA data

Retorne APENAS no formato JSON:
{"dataValidade": "YYYY-MM-DD", "metodo": "explicito|calculado|intervalo"}

Se não encontrar, retorne:
{"dataValidade": null, "erro": "motivo"}`;

        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { 
                    type: 'image_url',
                    image_url: {
                      url: `data:application/pdf;base64,${pdfBase64}`
                    }
                  }
                ]
              }
            ],
            max_completion_tokens: 500,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Erro na API Lovable AI:', errorText);
          throw new Error(`Erro AI: ${response.status}`);
        }

        const aiResult = await response.json();
        const aiText = aiResult.choices[0].message.content;
        console.log('Resposta da AI:', aiText);

        // Extrair JSON da resposta
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.dataValidade) {
            pdfText = `VALIDADE EXTRAÍDA POR OCR: ${parsed.dataValidade} (método: ${parsed.metodo})`;
            console.log('✅ OCR concluído via Lovable AI Vision');
            console.log('Data extraída:', parsed.dataValidade);
          } else {
            console.warn('AI não conseguiu extrair data:', parsed.erro);
          }
        }
      } catch (ocrError) {
        console.error('❌ Erro ao aplicar OCR com Lovable AI:', ocrError);
        console.log('Continuando com texto original (pode estar vazio)');
      }
    }
    
    let dataValidade: string | null = null;
    
    // Normalizar texto para melhorar extração de PDFs digitalizados/escaneados
    // Remove espaços extras entre dígitos que podem vir de OCR
    const normalizedText = pdfText
      .replace(/(\d)\s+(\d)/g, '$1$2')  // Remove espaços entre números
      .replace(/\s+/g, ' ')              // Normaliza múltiplos espaços
      .trim();
    
    // Padrões de data mais robustos (aplicar no texto normalizado)
    const datePatterns = [
      // DD/MM/YYYY com separadores variados
      /(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/g,
      // DD de MMMM de YYYY (por extenso)
      /(\d{2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi,
      // YYYY-MM-DD
      /(\d{4})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{2})/g,
    ];
    
    const monthNames: { [key: string]: number } = {
      'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
      'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
      'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
      'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
      'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
    };
    
    const extractedDates: Date[] = [];
    
    // PRIMEIRO: Verificar se o documento menciona "válida por X dias" ou similar
    // Aplicar nos dois textos (original e normalizado) para maior abrangência
    const validadeDiasPatterns = [
      /(?:válida?|valida?)\s+(?:por)?\s*(\d+)\s+(?:dias?|dia)/gi,
      /(?:prazo|validade)\s+(?:de)?\s*(\d+)\s+(?:dias?|dia)/gi,
      /(\d+)\s+(?:dias?|dia).*?(?:válida?|valida?|validade)/gi,
      /(?:cento\s+e\s+oitenta|180)\s+(?:dias?|dia)/gi,  // Específico para 180 dias
      /(?:noventa|90)\s+(?:dias?|dia)/gi,               // Específico para 90 dias
      /(?:sessenta|60)\s+(?:dias?|dia)/gi,              // Específico para 60 dias
      /(?:trinta|30)\s+(?:dias?|dia)/gi,                // Específico para 30 dias
      /(?:cento\s+e\s+vinte|120)\s+(?:dias?|dia)/gi,   // Específico para 120 dias
    ];
    
    let numeroDias: number | null = null;
    
    // Tentar primeiro no texto normalizado
    for (const pattern of validadeDiasPatterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(normalizedText);
      if (!match) {
        pattern.lastIndex = 0;
        match = pattern.exec(pdfText);
      }
      
      if (match) {
        // Se é um número por extenso, converter
        const extensoMap: {[key: string]: number} = {
          'cento e oitenta': 180, 'cento e vinte': 120,
          'noventa': 90, 'sessenta': 60, 'trinta': 30
        };
        
        const matchText = match[0].toLowerCase();
        numeroDias = parseInt(match[1]) || Object.entries(extensoMap)
          .find(([extenso]) => matchText.includes(extenso))?.[1] || null;
        
        if (numeroDias) {
          console.log(`===== ENCONTRADO: Documento válido por ${numeroDias} dias =====`);
          break;
        }
      }
    }
    
    if (numeroDias) {
      console.log(`Buscando data de emissão para calcular validade...`);
      
      // Extrair TODAS as datas do documento primeiro (usar texto normalizado)
      const todasDatas: Array<{date: Date, text: string, position: number}> = [];
      
      for (const pattern of datePatterns) {
        pattern.lastIndex = 0;
        let match;
        // Tentar primeiro no texto normalizado
        const textoParaBusca = normalizedText;
        while ((match = pattern.exec(textoParaBusca)) !== null) {
          let day: number, month: number, year: number;
          
          if (match[0].toLowerCase().includes('de') && isNaN(parseInt(match[2]))) {
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
            todasDatas.push({
              date: date,
              text: match[0],
              position: match.index
            });
          }
        }
      }
      
      if (todasDatas.length > 0) {
        console.log('Todas as datas encontradas (em ordem de aparição):');
        todasDatas.forEach((d, i) => {
          console.log(`  ${i + 1}. ${d.text} = ${d.date.toISOString().split('T')[0]} (posição ${d.position})`);
        });
        
        // Procurar data de emissão perto de palavras-chave
        // Padrões comuns: localidade + data, ou palavras como "expedição", "emissão"
        const emissaoPatterns = [
          /(?:rio\s+de\s+janeiro|são\s+paulo|brasília|brasil|saquarema|niterói),?\s*(?:rj|sp|df)?,?\s*(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
          /(?:expedição|emissão|emitida\s+em|data\s+de\s+emissão)[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
          /(?:expedição|emissão)[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
        ];
        
        let localidadeMatch: RegExpExecArray | null = null;
        for (const pattern of emissaoPatterns) {
          pattern.lastIndex = 0;
          localidadeMatch = pattern.exec(normalizedText);
          if (!localidadeMatch) {
            pattern.lastIndex = 0;
            localidadeMatch = pattern.exec(pdfText);
          }
          if (localidadeMatch) break;
        }
        
        let dataEmissao: Date | null = null;
        
        if (localidadeMatch) {
          const day = parseInt(localidadeMatch[1]);
          const month = parseInt(localidadeMatch[2]);
          const year = parseInt(localidadeMatch[3]);
          
          if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
            dataEmissao = new Date(year, month - 1, day);
            console.log(`>>> DATA DE EMISSÃO encontrada perto de localidade: ${dataEmissao.toISOString().split('T')[0]}`);
          }
        }
        
        // Se não encontrou perto de localidade, pegar a ÚLTIMA data (geralmente é a data de emissão em certidões)
        if (!dataEmissao && todasDatas.length > 0) {
          dataEmissao = todasDatas[todasDatas.length - 1].date;
          console.log(`>>> DATA DE EMISSÃO (última data do documento): ${dataEmissao.toISOString().split('T')[0]}`);
        }
        
        // Calcular validade: emissão + dias (somente se encontrou data de emissão)
        if (dataEmissao) {
          const dataValidadeCalculada = new Date(dataEmissao);
          dataValidadeCalculada.setDate(dataValidadeCalculada.getDate() + numeroDias);
          
          dataValidade = `${dataValidadeCalculada.getFullYear()}-${String(dataValidadeCalculada.getMonth() + 1).padStart(2, '0')}-${String(dataValidadeCalculada.getDate()).padStart(2, '0')}`;
          
          console.log(`>>> DATA DE VALIDADE CALCULADA: ${dataEmissao.toISOString().split('T')[0]} + ${numeroDias} dias = ${dataValidade}`);
          console.log('=============================================================');
        } else {
          console.log('>>> ERRO: Não foi possível identificar data de emissão para calcular validade');
        }
      }
    }
    
    // Se não encontrou padrão "válida por X dias", procurar por padrões explícitos de validade
    if (!dataValidade) {
      // Primeiro: Procurar padrões muito específicos de certidões brasileiras
      const validadeExplicitaPatterns = [
        /válida?\s+até[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
        /valida?\s+ate[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
        /vencimento[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
        /data\s+de\s+vencimento[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
        /expira\s+em[:\s]+(\d{2})[\/\-\.\s]{1,3}(\d{2})[\/\-\.\s]{1,3}(\d{4})/gi,
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
            console.log(`Data de validade EXPLÍCITA encontrada: ${dataValidade}`);
            break;
          }
        }
      }
    }
    
    // Se ainda não encontrou, continuar com palavras-chave genéricas
    if (!dataValidade) {
      // Palavras-chave que indicam validade
      const validadeKeywords = [
        'validade', 'válido até', 'valido ate', 'vencimento', 'válida até', 'valida ate',
        'expira em', 'prazo', 'vigência', 'vigencia', 'data de vencimento', 'vence em', 'vencimento'
      ];
      
      // Procurar por datas próximas às palavras-chave de validade
      for (const keyword of validadeKeywords) {
        const keywordIndex = pdfText.toLowerCase().indexOf(keyword.toLowerCase());
        if (keywordIndex !== -1) {
          // Pegar um contexto de 300 caracteres após a palavra-chave
          const context = pdfText.substring(keywordIndex, keywordIndex + 300);
          console.log(`Contexto encontrado para "${keyword}":`, context);
          
          // Para CRF FGTS, procurar especificamente pelo padrão "DD/MM/YYYY a DD/MM/YYYY"
          if (tipoDocumento === 'crf_fgts') {
            // Padrão específico para intervalo de datas: "28/10/2025 a 26/11/2025"
            const intervalPattern = /(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+a\s+(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i;
            const intervalMatch = intervalPattern.exec(context);
            
            if (intervalMatch) {
              // Pegar a SEGUNDA data (fim do período de validade)
              const day = parseInt(intervalMatch[4]);
              const month = parseInt(intervalMatch[5]);
              const year = parseInt(intervalMatch[6]);
              
              console.log('CRF FGTS - Intervalo encontrado, segunda data:', { day, month, year });
              
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2100) {
                dataValidade = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                console.log('CRF FGTS - Data final do intervalo (validade):', dataValidade);
                break;
              }
            }
          }
          
          // Se não encontrou o padrão de intervalo, extrair todas as datas do contexto
          if (!dataValidade) {
            const contextDates: Date[] = [];
            
            // Tentar extrair todas as datas do contexto
            for (const pattern of datePatterns) {
              pattern.lastIndex = 0; // Reset regex
              let match;
              while ((match = pattern.exec(context)) !== null) {
                console.log('Match encontrado:', match[0]);
                let day: number, month: number, year: number;
                
                // Verificar se é data por extenso
                if (match[0].toLowerCase().includes('de') && isNaN(parseInt(match[2]))) {
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
                  contextDates.push(date);
                  extractedDates.push(date);
                  console.log('Data válida adicionada:', date.toISOString());
                }
              }
            }
            
            // Para CRF FGTS, se houver múltiplas datas no contexto, pegar a ÚLTIMA (segunda)
            if (tipoDocumento === 'crf_fgts' && contextDates.length >= 2) {
              const lastDate = contextDates[contextDates.length - 1];
              dataValidade = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;
              console.log('CRF FGTS - Última data do contexto (validade):', dataValidade);
              break;
            } else if (contextDates.length > 0) {
              // Para outros documentos, usar a primeira data encontrada
              const firstDate = contextDates[0];
              dataValidade = `${firstDate.getFullYear()}-${String(firstDate.getMonth() + 1).padStart(2, '0')}-${String(firstDate.getDate()).padStart(2, '0')}`;
              console.log('Data encontrada próxima à palavra-chave:', dataValidade);
              break;
            }
          }
        }
      }
    }
    
    // Se não encontrou data com palavras-chave, extrair todas as datas do texto
    if (!dataValidade) {
      console.log('Não encontrou data com palavras-chave, extraindo todas as datas...');
      
      for (const pattern of datePatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(pdfText)) !== null) {
          let day: number, month: number, year: number;
          
          if (match[0].toLowerCase().includes('de') && isNaN(parseInt(match[2]))) {
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
      if (extractedDates.length > 0) {
        console.log('Datas encontradas:', extractedDates.map(d => d.toISOString().split('T')[0]));
      }
      
      // Para CRF FGTS, pegar sempre a SEGUNDA data (primeira é emissão, segunda é validade)
      if (tipoDocumento === 'crf_fgts' && extractedDates.length >= 2) {
        dataValidade = extractedDates[1].toISOString().split('T')[0];
        console.log('CRF FGTS - Segunda data (validade):', dataValidade);
      } else if (tipoDocumento === 'crf_fgts' && extractedDates.length === 1) {
        // Se só tem uma data, usar ela
        dataValidade = extractedDates[0].toISOString().split('T')[0];
        console.log('CRF FGTS - Única data encontrada:', dataValidade);
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
