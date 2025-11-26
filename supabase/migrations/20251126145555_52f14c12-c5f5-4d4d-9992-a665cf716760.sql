-- Criar tabela para assinaturas de usuários internos em atas
CREATE TABLE public.atas_assinaturas_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ata_id UUID NOT NULL REFERENCES public.atas_selecao(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL,
  status_assinatura TEXT NOT NULL DEFAULT 'pendente',
  data_notificacao TIMESTAMP WITH TIME ZONE,
  data_assinatura TIMESTAMP WITH TIME ZONE,
  ip_assinatura TEXT,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ata_id, usuario_id)
);

-- Habilitar RLS
ALTER TABLE public.atas_assinaturas_usuario ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can manage atas assinaturas usuario"
ON public.atas_assinaturas_usuario
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Users can view and update own assinaturas"
ON public.atas_assinaturas_usuario
FOR ALL
USING (usuario_id = auth.uid());

CREATE POLICY "Public can view assinaturas usuario for verification"
ON public.atas_assinaturas_usuario
FOR SELECT
USING (true);

-- Índices para performance
CREATE INDEX idx_atas_assinaturas_usuario_ata_id ON public.atas_assinaturas_usuario(ata_id);
CREATE INDEX idx_atas_assinaturas_usuario_usuario_id ON public.atas_assinaturas_usuario(usuario_id);
CREATE INDEX idx_atas_assinaturas_usuario_status ON public.atas_assinaturas_usuario(status_assinatura);