-- =====================================================================
-- 02 — MIGRAÇÃO INCREMENTAL: aulas (PROPOSTA — NÃO EXECUTADA)
-- =====================================================================
-- Necessária: /admin/dashboard (db.lesson.count), /admin/aulas, /aluno/aulas,
-- /aluno/aulas/[id] e /api/admin/lessons consultam "lessons" sem fallback.
-- Origem: prisma/local/lessons.sql (mesma estrutura aplicada no banco local
-- de testes), com pré/pós-condições e transação explícita.
-- Natureza: somente cria objetos novos; não toca tabelas existentes.
--
-- Execução (após 01, autorização e ensaio em branch):
--   psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 02-lessons.sql
-- =====================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

DO $pre$
BEGIN
  IF to_regclass('public.lessons') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabela lessons já existe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LessonStatus' AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PRECONDITION: tipo "LessonStatus" já existe';
  END IF;
END
$pre$;

CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TABLE "lessons" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 1440),
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "lessons_status_position_idx" ON "lessons"("status", "position");

DO $post$
BEGIN
  IF EXISTS (SELECT 1 FROM lessons) THEN
    RAISE EXCEPTION 'POSTCONDITION: lessons deveria estar vazia';
  END IF;
END
$post$;

COMMIT;

-- Observação: nenhuma aula é importada. O conteúdo é cadastrado depois pelo
-- admin em /admin/aulas (aulas nascem como DRAFT).
