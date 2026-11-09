-- ============================================================
-- MIGRATION_V6
-- Adiciona CPF ao perfil (usado pra qualificar o motorista no
-- contrato de prestação de serviço, gerado em Jurídico).
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================

alter table public.profiles add column if not exists cpf text;

-- ============================================================
-- FIM DA MIGRAÇÃO
-- ============================================================
