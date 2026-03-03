
-- Alterar FK de contratos_terceiros para CASCADE (em vez de SET NULL)
-- Assim, quando um processo_para_contratar é deletado, o contrato é deletado junto
ALTER TABLE public.contratos_terceiros
  DROP CONSTRAINT contratos_terceiros_processo_para_contratar_id_fkey;

ALTER TABLE public.contratos_terceiros
  ADD CONSTRAINT contratos_terceiros_processo_para_contratar_id_fkey
  FOREIGN KEY (processo_para_contratar_id)
  REFERENCES public.processos_para_contratar(id)
  ON DELETE CASCADE;

-- Também garantir CASCADE na FK de documentos_contrato -> contratos_terceiros
ALTER TABLE public.documentos_contrato
  DROP CONSTRAINT documentos_contrato_contrato_terceiro_id_fkey;

ALTER TABLE public.documentos_contrato
  ADD CONSTRAINT documentos_contrato_contrato_terceiro_id_fkey
  FOREIGN KEY (contrato_terceiro_id)
  REFERENCES public.contratos_terceiros(id)
  ON DELETE CASCADE;
