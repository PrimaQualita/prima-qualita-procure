-- Tabela para rastrear assinaturas/aceites dos fornecedores nas atas
CREATE TABLE public.atas_assinaturas_fornecedor (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ata_id UUID NOT NULL REFERENCES public.atas_selecao(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  status_assinatura TEXT NOT NULL DEFAULT 'pendente', -- pendente, aceito, recusado
  data_notificacao TIMESTAMP WITH TIME ZONE,
  data_assinatura TIMESTAMP WITH TIME ZONE,
  ip_assinatura TEXT,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ata_id, fornecedor_id)
);

-- Adicionar coluna para indicar se a ata foi enviada aos fornecedores
ALTER TABLE public.atas_selecao ADD COLUMN IF NOT EXISTS enviada_fornecedores BOOLEAN DEFAULT false;
ALTER TABLE public.atas_selecao ADD COLUMN IF NOT EXISTS data_envio_fornecedores TIMESTAMP WITH TIME ZONE;

-- Enable RLS
ALTER TABLE public.atas_assinaturas_fornecedor ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can manage atas assinaturas" 
ON public.atas_assinaturas_fornecedor 
FOR ALL 
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Fornecedores can view and update own assinaturas" 
ON public.atas_assinaturas_fornecedor 
FOR ALL 
USING (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()));

CREATE POLICY "Public can view assinaturas for verification" 
ON public.atas_assinaturas_fornecedor 
FOR SELECT 
USING (true);