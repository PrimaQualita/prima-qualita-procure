import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64 } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "PDF base64 é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // Use Gemini vision to extract CNAEs from the CNPJ card PDF
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um extrator especializado em documentos de CNPJ (Comprovante de Inscrição e de Situação Cadastral da Receita Federal do Brasil).
Sua tarefa é extrair TODAS as atividades econômicas (CNAEs) do documento.

Retorne EXCLUSIVAMENTE um JSON válido no seguinte formato, sem nenhum texto adicional:
{
  "cnaes": [
    {
      "codigo": "00.00-0-00",
      "descricao": "Descrição da atividade",
      "tipo": "primaria"
    },
    {
      "codigo": "00.00-0-00",
      "descricao": "Descrição da atividade",
      "tipo": "secundaria"
    }
  ]
}

Regras:
- O campo "tipo" deve ser "primaria" para a Atividade Econômica Principal e "secundaria" para todas as Atividades Econômicas Secundárias.
- O código CNAE deve manter o formato original do documento (XX.XX-X-XX).
- A descrição deve ser exatamente como aparece no documento.
- Se não encontrar CNAEs, retorne {"cnaes": []}.
- NUNCA inclua texto fora do JSON.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia todas as atividades econômicas (CNAEs) primárias e secundárias deste Comprovante de Inscrição e de Situação Cadastral (Cartão CNPJ)."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido, tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes para processamento de IA." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro ao processar documento com IA");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from the AI response
    let cnaes = [];
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        cnaes = parsed.cnaes || [];
      }
    } catch (parseError) {
      console.error("Erro ao parsear resposta da IA:", parseError, "Conteúdo:", content);
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair os CNAEs do documento. Verifique se o PDF é um Comprovante de Inscrição e de Situação Cadastral válido.", cnaes: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ cnaes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na extração de CNAEs:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
