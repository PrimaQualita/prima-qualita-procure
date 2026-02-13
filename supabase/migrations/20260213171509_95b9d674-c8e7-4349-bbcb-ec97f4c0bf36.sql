
-- Add ciente (acknowledged) fields to contratos_terceiros for expired contract notifications
ALTER TABLE public.contratos_terceiros
ADD COLUMN IF NOT EXISTS ciente_nao_renovar boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_ciente timestamptz DEFAULT null,
ADD COLUMN IF NOT EXISTS motivo_ciente text DEFAULT null;
