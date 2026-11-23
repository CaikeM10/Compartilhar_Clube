# CLAUDE.md — Compartilhar Clube

Guia para agentes (Claude Code, Codex) e pessoas que trabalham neste repositório. Tudo aqui foi verificado no código em 2026-11-10 (base: commit `c575b9c`). Ao mudar arquitetura, atualize este arquivo. Não existe `AGENTS.md`; se for criado, mantenha os dois consistentes.

## 1. Visão geral

Plataforma de assinatura para educadores/psicólogos com:
- **Site público**: clube, contato, materiais (vitrine com links Hotmart), recursos, login, recuperação de senha, checkout (Mercado Pago).
- **Área do aluno** (`/aluno/*`): dashboard, aulas, biblioteca de recursos, supervisões, solicitar supervisão, avaliação, sugestões.
- **Área administrativa** (`/admin/*`): dashboard, aulas, recursos (materiais), usuários, configurações.

## 2. Stack (versões reais de `package.json`)

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.0.10 (App Router), React 19.2.0, TypeScript 5 (strict) |
| Estilo/UI | Tailwind CSS v4 (`@tailwindcss/postcss`, sem `tailwind.config`), shadcn/ui estilo new-york (`components.json`), Radix, lucide-react |
| Formulários/validação | zod 3.25.76 (react-hook-form instalado, usado só em `components/ui/form.tsx`) |
| Feedback | sonner e Radix toast instalados — **nenhum Toaster montado** em `app/layout.tsx` |
| Banco | PostgreSQL + Prisma / @prisma/client 5.10.2 |
| Auth | Better Auth 1.7.17 com adapter Prisma |
| Pagamento | `mercadopago` ^2.12.0 (checkout + webhook) — **fora de escopo para alterações** |
| Deploy | Vercel (`@vercel/analytics`) |
| Gerenciador | pnpm 10.20.0 (existe também `package-lock.json` legado) |

Alias de import: `@/*` → raiz. `next.config.js` só define `allowedDevOrigins`. Não há `middleware.ts`/`proxy.ts`.

## 3. Estrutura de diretórios

| Caminho | Responsabilidade |
|---|---|
| `app/` | Páginas App Router (públicas, `aluno/`, `admin/`, `checkout/`). |
| `app/api/` | Route handlers: `auth/[...all]`, `account/session`, `account/password`, `admin/lessons`, `admin/lessons/[id]`, `admin/materials` (+ `[id]`, `[id]/pdf`, `order`), `admin/users` (+ `[id]/role`, `[id]/access`), `materials/[id]/download`, `create-payment` (MP), `webhook` (MP). |
| `lib/storage/` | Contrato de armazenamento privado (`PrivateObjectStorage`) e `getPrivateStorage()`; hoje retorna o provedor "não configurado". |
| `components/ui/` | shadcn (arquivos kebab-case). Não reescrever; reutilizar. |
| `components/layout/` | `Header`, `Footer`, `Container`, `MemberLayout`, `AdminLayout`. |
| `components/{lessons,library,materials,student}/` | Componentes de domínio (PascalCase). |
| `contexts/AuthContext.tsx` | Estado de sessão no cliente (apenas exibição). |
| `lib/<domínio>/` | Lógica de domínio: `auth/`, `lessons/`, `materials/`, `payments/`, `student/`, `admin/`. |
| `lib/prisma.ts` | PrismaClient compartilhado. |
| `prisma/` | `schema.prisma`, `local/lessons.sql`, `proposals/materials.{prisma,sql}`. **Sem `migrations/`.** |
| `scripts/` | Scripts `.cjs` locais (launcher dev isolado, fixtures, catálogo, checagens de schema, teste do webhook). |
| `tests/` | `*.test.cjs` com `node:test`. |
| `docs/` | Auditorias e registros de homologação — leitura obrigatória antes de mexer em auth/materiais. |
| `public/` | Imagens e capas (`materials-covers/`). **Nunca colocar PDFs privados aqui.** |

Legados (não usar em código novo): `services/api.ts` (mock), `hooks/useResources`, `hooks/useLessons` (mocks), `lib/auth.ts` (`checkUserAcess`, sem uso), `components/ProtectedRoute.tsx` (guarda apenas visual), `styles/globals.css` (o ativo é `app/globals.css`). O `README.md` está parcialmente desatualizado.

## 4. Convenções

### Páginas
- Server Components por padrão. Toda página protegida chama `await requirePageAccess("account" | "admin" | "subscriber")` (`lib/auth/page-access.ts`) **na própria página**, além do layout.
- `"use client"` só em componentes interativos.

### APIs (padrão do módulo de aulas — copie-o)
- Somente route handlers; **não há server actions**.
- Cada rota exporta `runtime = "nodejs"` e `dynamic = "force-dynamic"` e é um wrapper fino.
- Lógica em `lib/<domínio>/service-core.ts`: factory que recebe `db` e guards por injeção (ex.: `createMaterialService(db, requireAdmin)`), testável sem banco. `lib/<domínio>/server.ts` faz a ligação real (`import "server-only"`, reusa `getAuthInfrastructure().db`).
- Guard de autorização é a **primeira linha** de cada método do service.
- Respostas: `Response.json`, erros `{ error: "CODIGO" }` com status do `AuthorizationError`/erro de domínio; desconhecido → 503. Headers `Cache-Control: private, no-store` e `Vary: Cookie` (`lib/lessons/http.ts`).
- Mutações passam por `mutationBody()` (`lib/lessons/http.ts`): Origin igual a `BETTER_AUTH_URL`, rejeita cross-site, exige JSON, limite 64 KB. `lib/materials/http.ts` reexporta esse mesmo `mutationBody` (seus erros são `LessonError`) e oferece `materialResponse()` / `materialRedirect()` (302 para URL assinada, `no-store`, `Referrer-Policy: no-referrer`).
- Na rota, o guard é chamado explicitamente (`await requireAdmin()` / `await requireActiveSubscription()`) **e** de novo dentro do service. `tests/material-catalog.test.cjs` verifica isso em todo handler de materiais.
- Validação zod `.strict()` + `safeParse`, mapeada para erro 400 de domínio (`lib/lessons/validation.ts`, `lib/materials/validation.ts`).
- Concorrência otimista via `expectedUpdatedAt` + `updateMany` (409 em conflito).
- DTOs mínimos: nunca devolver `storageKey`, `role`, `disabledAt` ou dados de outros usuários.

### Código
- TypeScript strict; sem `any` novo.
- Componentes de domínio em PascalCase; `components/ui` em kebab-case.
- Reutilizar componentes shadcn existentes e as cores da marca (#2f4a70, #e1b12c, #4a6278, #b55239; fontes Inter/Poppins).

## 5. Autenticação e autorização

- `lib/auth/config.ts`: `readAuthEnvironment()` exige `BETTER_AUTH_SECRET` (≥32) e `BETTER_AUTH_URL` (https, ou http em localhost fora de produção). `createServerAuth()`: email+senha, sessão de 7 dias, sem cookie cache, prefixo `compartilhar-clube`; campos `role`/`disabledAt` não editáveis pelo cliente; hook bloqueia injeção de `role`, `emailVerified`, `disabledAt`, `userId`, `id`; usuários desativados não obtêm sessão.
- `lib/auth/server.ts`: `getAuthInfrastructure()` (instância auth + Prisma).
- `GET /api/account/session` devolve `{ user: { id, name, email, role: "admin"|"student", createdAt }, destination }`.
- Papel: enum `User.role` (`ADMIN`/`STUDENT`), **relido do banco a cada verificação**. Não há allowlist por email.
- Guards (`lib/auth/authorization.ts`): `requireSession()`, `requireAdmin()`, `requirePrincipalAdmin()`, `requireActiveSubscription()` e `requirePasswordChangeSession()` (só `/api/account/session`, `/api/account/password` e `/conta/alterar-senha`); erro `AuthorizationError` (401 `UNAUTHENTICATED`, 403 `FORBIDDEN` / `SUBSCRIPTION_REQUIRED` / `PASSWORD_CHANGE_REQUIRED` / `PRINCIPAL_ADMIN_REQUIRED`).
- **Administrador principal** = `role = ADMIN` + `User.isPrincipalAdmin = true` (sem `SUPER_ADMIN`). Exatamente as contas designadas por `scripts/principal-admin-operator.cjs designate` (no máximo 2, travado também por gatilho no banco). O painel **nunca** grava `isPrincipalAdmin` nem altera/rebaixa principais. Principal cria ADMIN comum e promove/rebaixa ADMIN comum; ADMIN comum só cria aluno.
- **Troca obrigatória de senha**: `User.mustChangePassword` (ligado em toda conta criada pelo painel ou recuperada pelo operador) faz `requireSession` e derivados recusarem com `PASSWORD_CHANGE_REQUIRED`; páginas redirecionam para `/conta/alterar-senha` (`PASSWORD_CHANGE_PATH`). Login/logout/troca continuam funcionando.
- Criação de contas pelo painel: `lib/admin/user-management-core.ts` com `createServerAuth(tx, { ...env, serverProvisioning: true })` (cadastro só nessa instância, `autoSignIn: false`, sem `nextCookies`, nunca montada em rota). Com `autoSignIn: false` o Better Auth responde duplicata com usuário sintético: sempre conferir a linha real. Auditoria em `admin_audit_events` na mesma transação.
- Assinatura ativa = `Subscription.status === "active"` e `startDate <= agora < endDate`. Admin **não** recebe assinatura implícita.
- **Acesso aos conteúdos** (`requireActiveSubscription()`, nome mantido por compatibilidade, código de erro `SUBSCRIPTION_REQUIRED` inalterado) = `requireSession()` (conta desativada e troca de senha pendente continuam bloqueando) **e** (assinatura paga ativa **OU** concessão manual válida: `ManualAccessGrant.revokedAt IS NULL` e `startsAt <= agora < endsAt`). A assinatura é lida primeiro; a concessão só sem assinatura, de modo que falha na tabela de concessões nunca bloqueia pagante. As duas fontes são independentes: concessão nunca cria/altera `Plan`/`Subscription`/`Payment` e revogá-la não toca assinatura. Retorno inclui `access: { source: "subscription" | "grant", endsAt }`.
- **Cadastro público fechado:** `emailAndPassword.disableSignUp = environment.allowSignUp !== true`. `readAuthEnvironment()` nunca define `allowSignUp`; só código de servidor confiável (scripts de provisionamento/locais, testes de integração) injeta `allowSignUp: true` na própria instância. `tests/auth-signup-closed.test.cjs` cobre isso sem banco.
- Primeiro ADMIN remoto: `scripts/provision-production-admin.cjs` (`create` | `link-existing`), entradas ocultas, uma transação, prova de login antes da promoção. Execução só com autorização explícita.
- Contas adicionais remotas: `scripts/provision-production-account.cjs` (`admin` | `student`). Mesmas garantias, mais: só cria conta nova (e-mail existente em qualquer caixa → recusa); impressões digitais de todos os outros usuários/credenciais e de `plans`/`subscriptions`/`payments` conferidas; `admin` exige ADMIN existente e a quantidade confirmada pelo operador; `student` sem assinatura/plano/pagamento. O Better Auth só recebe o cliente de transação (sem `$transaction`), conferido em execução e por teste de contrato em `tests/provision-account.test.cjs`. Procedimento: README de `docs/producao-migracao/`, seção 13. Nunca executado.
- **Regra:** layout protegido não substitui verificação na API; toda operação revalida sessão e permissão no servidor.
- Não alterar o fluxo de autenticação sem necessidade comprovada e autorização.

## 6. Prisma / PostgreSQL

- `prisma/schema.prisma` (provider `postgresql`, `env("DATABASE_URL")`). Modelos: `Lesson`, `User`, `Account`, `Session`, `Verification`, `Plan`, `Subscription`, `Payment`, `AdminAuditEvent`, `ManualAccessGrant`, `ManualAccessEvent`, `Material`, `MaterialAsset`. Enums: `LessonStatus`, `Role`, `AdminAuditAction`, `ManualAccessAction` (GRANTED/RENEWED/REVOKED), `MaterialStatus` (DRAFT/PUBLISHED/ARCHIVED), `MaterialAssetStatus` (PENDING/VALIDATED/REJECTED/ARCHIVED).
- Gerenciamento de usuários: `User.isPrincipalAdmin`/`mustChangePassword` e `AdminAuditEvent` estão no schema e na proposta (`prisma/proposals/admin-users.{prisma,sql}`; `docs/producao-migracao/06/07/92`). O 06 foi aplicado **apenas** no banco local de teste (2026-11-20, 07 aprovado; backup pós-06 em `Compartilhar_Clube_Backups/` fora do repositório). Branch Neon e produção: não aplicados. Os arquivos SQL são reutilizáveis (não registram execuções); o histórico por banco fica no README de `docs/producao-migracao/`, seções 14 e 15. As travas de schema removem exatamente esses acréscimos (`tests/admin-users-schema.cjs`) e comparam com o hash original.
- Liberação manual de acesso: `ManualAccessGrant` (1 linha por aluno, `userId @unique`, revogação lógica) e `ManualAccessEvent` (auditoria somente inclusão, períodos antes/depois) estão no schema e na proposta (`prisma/proposals/manual-access.{prisma,sql}`; `docs/producao-migracao/08/09/93`). O 08 foi aplicado **apenas** no banco local de teste (2026-11-22; backup pré-08 em `Compartilhar_Clube_Backups/` fora do repositório). Branch Neon e produção: não aplicados. Num banco sem o 08, `pnpm dev` reiniciado responde 503 nas áreas exclusivas para aluno sem assinatura paga. O 08 depende do 06; reversão sempre **93 antes de 92** (o 92 aborta enquanto existirem objetos do 08). As travas de schema removem esses acréscimos primeiro (`tests/manual-access-schema.cjs`) e depois os do 06.
- **Não há histórico de migrations.** O bloco de materiais foi aplicado **apenas** no banco local `compartilhar_auth_test@127.0.0.1:5432` por `scripts/local-material-catalog.cjs` (recibo em `docs/catalogo/local-persistence.json`). Produção não tem essas tabelas.
- `prisma/proposals/materials.sql` contém CHECKs que o Prisma não expressa (preço ≥ 0, BRL, PDF-only, checksum sha256 para VALIDATED, no máximo 1 asset VALIDATED por material).
- `MaterialAsset → Material` com `onDelete: Restrict`; exclusão de material é lógica (`status = ARCHIVED`).
- Migração de produção (Neon): proposta e ensaios em `docs/producao-migracao/` (README com status, SQL 00–03/90, resultados). Ensaio local: `node scripts/migration-rehearsal-local.cjs` (sempre ROLLBACK). Branch Neon: `scripts/neon-branch-smoke.cjs` (sempre ROLLBACK). Ensaio completo na branch Neon e login real no Preview aprovados em 2026-11-15; produção **não migrada**. Ordem obrigatória: publicar primeiro o código com cadastro fechado e só depois aplicar 01/02 (a `main` anterior, `63380a4`, tem cadastro aberto). Nada aplicado em produção sem autorização.
- Materiais em produção: `docs/producao-migracao/04-materials.sql` (DDL + importação dos 15), `05-…-somente-leitura.sql` (trava antes de ligar `MATERIALS_PERSISTENCE`) e `91-materials-reversao.sql` são **gerados** por `scripts/material-production-sql.cjs` a partir do catálogo (não editar à mão; `tests/material-production-sql.test.cjs` compara). Nunca executados (seção 12 do README). Importação: 14 `PUBLISHED` + `material-initial-014` em `DRAFT` (sem link Hotmart); conflito ou id duplicado aborta tudo (`MATERIAL_IMPORT_CONFLICT`/`DUPLICATE_MATERIAL_ID`).
- Proibido: `prisma migrate reset`, `prisma db push` automático, `DROP`/`TRUNCATE`/deleções em massa, qualquer escrita no Neon/produção. Mudanças de schema = proposta SQL revisável e não destrutiva, aplicada só com autorização.

## 7. Segurança e isolamento de ambientes

- **Nunca** ler, imprimir, copiar ou versionar `.env*`, `.env.auth-test.local`, `.local-auth-admin.json` ou qualquer credencial (`.gitignore` cobre `.env*`). Senhas nunca por argumento, arquivo, env ou chat.
- Desenvolvimento: `pnpm dev` → `scripts/local-auth-admin.cjs dev`, que cria ambiente isolado (snapshot sem `.env*`, banco local validado, `BETTER_AUTH_URL=http://127.0.0.1:3000`, segredo aleatório, `MATERIALS_PERSISTENCE=enabled`). **Não rodar `next dev` direto** (carrega o `.env` raiz → 503). Usar `127.0.0.1`, não `localhost`.
- `scripts/auth-test-safety.cjs` (`validateTarget`/`verifyServer`) só aceita `compartilhar_auth_test_user@127.0.0.1:5432/compartilhar_auth_test`; scripts que tocam banco devem reutilizá-lo.
- `MATERIALS_PERSISTENCE` precisa ser exatamente `"enabled"`; caso contrário `lib/materials/server.ts` falha fechado (503).
- Arquivos privados (PDFs): metadado persistido + endpoint de download autorizado + armazenamento privado. Nada em `public/`, nenhuma URL pública permanente.

## 8. Testes e validação

- Testes unitários: `node --test tests/<arquivo>.test.cjs` (Node `node:test` + `assert/strict`; transpilam TS com `typescript.transpileModule`, sem banco). Não há script `test` nem Jest/Vitest.
  - **Atenção:** `lessons` e `student-dashboard` têm cenários que conectam ao banco local quando `.env.auth-test.local` existe. Sem autorização para o banco local, rodar com `--test-skip-pattern="local PostgreSQL CRUD|persisted local roles|real authorized local PostgreSQL"`.
  - Seguros sem banco: `material-*.test.cjs`, `materials-carousel`, `private-access`, `lessons`, `auth-preparation`, `auth-test-safety`, `real-login`, `admin-dashboard`, `student-dashboard`, `auth-signup-closed`, `provision-admin`, `neon-branch-smoke`, `admin-users`, `admin-user-management`, `account-password`, `principal-admin-operator`, `admin-users-sql`, `manual-access`, `manual-access-sql`.
  - Regressão de auth com banco local (preserva todos os registros): `node scripts/local-auth-regression.cjs`.
  - Integração (`auth-integration`, `auth-server`, `local-auth-*`) exigem `.env.auth-test.local` e `--test-concurrency=1`; não rodar contra a conta manual preservada.
- Webhook: `npm run test:webhook`.
- Tipos: `npx tsc --noEmit`. Build: `pnpm build`.
- `npm run lint` **não funciona** (eslint não instalado, sem config; o script `lint` existe só em `package.json`). Limitação conhecida, sem correção planejada neste release.
- `pnpm build` carrega o `.env` raiz. Para build local sem tocar em banco real, sobrescreva `DATABASE_URL`, `BETTER_AUTH_URL` e `BETTER_AUTH_SECRET` com valores inertes no ambiente do processo (têm precedência sobre o `.env`).
- Materiais sem banco: `node --test tests/material-pages.test.cjs tests/material-admin-ui.test.cjs tests/material-admin.test.cjs tests/material-catalog.test.cjs tests/material-persistence.test.cjs tests/material-server.test.cjs`.
- `tests/material-catalog.test.cjs` contém guardas intencionais: hashes de ~34 arquivos protegidos (auth, pagamentos, aulas, schema fora do bloco de materiais, layouts); com persistência desligada, `/admin/recursos` e `/aluno/recursos` sem botões/links de download; `/materiais` deve renderizar HTML idêntico ao JSX aprovado em `docs/catalogo/baseline.json` (equivalência de renderização, com persistência desligada e com as 15 linhas semente); conjunto **exato** de rotas de materiais, cada handler com guard, sem Prisma/`storageKey`/env direto; nenhum `.pdf` em `public/`. Atualize as guardas de forma explícita e revisada quando a evolução for aprovada.
- `tests/private-access.test.cjs` compara o schema original removendo os blocos autorizados de `Lesson` e de materiais (este último precisa ser idêntico a `prisma/proposals/materials.prisma`, mesma regra do `material-catalog`); o hash de referência não mudou.
- Os cenários com PostgreSQL de `private-access` e `real-login` só rodam via `node scripts/local-auth-regression.cjs`; executados diretamente, falham com `AUTH_TEST_TARGET_REJECTED` (proteção intencional, não é defeito). Rodar só os cenários estáticos: `node --test --test-name-pattern="every private page|login and layout" tests/private-access.test.cjs tests/real-login.test.cjs`.
- Finais de linha: `.gitattributes` força LF (`* text=auto eol=lf`, imagens `binary`). Hashes e fixtures em `docs/` assumem LF; nunca recalcule um hash sem provar que a diferença é só de fim de linha (blob do índice idêntico).

## 9. Fluxo Git

- `main` = principal; `backup/codigo-local-codex-claude` = recuperação do código local (commit de referência `c575b9c`).
- Desenvolvimento em `feat/<nome>` (atual: `feat/admin-persistencia-recursos`).
- **Sem commit, push, merge ou deploy automáticos** — apenas quando solicitado.

## 10. Regras obrigatórias

1. Não modificar Mercado Pago: `app/api/create-payment/`, `app/api/webhook/`, `lib/payments/`, `app/checkout/**`, `scripts/test-webhook.cjs`, `tests/webhook.test.cjs`, credenciais.
2. Não alterar o fluxo de autenticação sem necessidade comprovada e autorização.
3. Não executar migrações destrutivas nem modificar o banco de produção.
4. Não acessar, copiar, imprimir ou versionar segredos.
5. Não fazer deploy, push, merge ou commits automaticamente.
6. Preservar componentes e design atuais.
7. Não usar dados fictícios como substitutos de funcionalidades reais.
8. Reutilizar a arquitetura existente antes de criar abstrações.
9. Não excluir arquivos ou funcionalidades sem autorização.
10. Validar alterações com testes e verificações apropriadas.

## 11. Estado atual

### Implementado
- Login real com Better Auth, sessão via `/api/account/session`, guards de página e de serviço.
- Aulas: CRUD admin persistente (`app/api/admin/lessons`, `components/lessons/LessonManager.tsx`).
- Dashboards admin e aluno com dados reais (`lib/admin/dashboard*`, `lib/student/subscription*`).
- Checkout e webhook Mercado Pago.
- Materiais:
  - Catálogo estático de 15 itens em `lib/materials/catalog.json` (preço em texto, capa em `public/`, link Hotmart) + `carousel.json` (10 itens).
  - Persistência local: modelos `Material`/`MaterialAsset`, 15 registros no banco local de teste.
  - Backend (Etapa B): `createMaterialService(db, { requireAdmin, requireActiveSubscription }, storage)` em `lib/materials/service-core.ts`:
    - Admin: `listAdmin`/`getAdmin` (incluem os assets PENDING/VALIDATED sem `storageKey`), `create` (sempre DRAFT), `change` (otimista; publicar/despublicar/arquivar via `status`), `reorder` (lista completa dos não arquivados → `displayOrder` pela posição; 409 se desatualizada).
    - PDF: `pdf(id, {action:"start"})` cria asset PENDING versionado com chave opaca e devolve URL de PUT assinada (o arquivo nunca passa pela função Vercel); `pdf(id, {action:"confirm"})` confere tamanho, `Content-Type`, assinatura `%PDF-` e calcula sha256 → VALIDATED (arquiva o anterior) ou REJECTED (422) e remove o objeto; `removePdf` → ARCHIVED, sem apagar o objeto. Limite: 25 MB (`PDF_MAX_BYTES`).
    - Público/aluno: `listPublished()` (sem auth, só PUBLISHED, campos comerciais); `listLibrary()` (assinatura ativa, `hasPdf`); `download(id)` (assinatura ativa + PUBLISHED + asset VALIDATED → URL assinada de 60 s).
    - Rotas: `GET/POST /api/admin/materials`, `GET/PATCH /api/admin/materials/[id]`, `PUT /api/admin/materials/order`, `POST/DELETE /api/admin/materials/[id]/pdf`, `GET /api/materials/[id]/download` (302).
  - Regras do service: publicar (ou manter publicado) exige `checkoutUrl` não vazio → 422 `MATERIAL_NOT_PUBLISHABLE`; capa só entre as imagens do catálogo (`knownCovers`, passado por `lib/materials/server.ts`) ou já usadas por algum material → 400 `INVALID_COVER`; P2002 → 409 `MATERIAL_CONFLICT`. Autorização STUDENT (inclusive com assinatura) coberta em `tests/material-authorization.test.cjs`, executando os handlers reais.
  - **Sem provedor de armazenamento configurado**, upload e download respondem 503 `STORAGE_NOT_CONFIGURED`; nenhum PDF existe ainda, então o download responde 404 `PDF_NOT_AVAILABLE`.
  - Admin (Etapa C): `/admin/recursos` usa `getMaterials().listAdmin()` e renderiza `components/materials/MaterialManager.tsx` (cadastro como rascunho, edição só dos campos alterados, publicar/despublicar, arquivar/restaurar com confirmação, reordenação ↑/↓ via `PUT /order`, status do PDF, aviso de armazenamento indisponível). Com `MATERIALS_PERSISTENCE` desligado (produção hoje) a página mostra `MaterialCatalogReadOnly` (catálogo estático em modo consulta). Helpers client-safe: `lib/materials/price.ts` (centavos ↔ reais, sem float), `lib/materials/admin-client.ts` (payloads, mensagens por status/código, `adminRequest`), `lib/materials/types.ts` (`MaterialAdminView`, `toMaterialAdminView` com whitelist). Capas: apenas imagens locais existentes do catálogo/banco.
  - Biblioteca e vitrine (Etapa D): `lib/materials/pages.ts` (`server-only`) expõe `getLibrary()` (usa `listLibrary()`, que revalida a assinatura) e `getPublicCatalog()` (usa `listPublished()`, sem login), com mapeamento por whitelist. O `catalog.json` só é usado quando `getMaterials()` lança `MATERIALS_PERSISTENCE_DISABLED`; qualquer outro erro propaga para `app/aluno/recursos/error.tsx` / `app/materiais/error.tsx`.
    - `/aluno/recursos`: `requirePageAccess("subscriber")` → `getLibrary()`; página dinâmica; `MaterialLibraryCard` mostra "Baixar PDF" (link para `/api/materials/[id]/download`) só quando `hasPdf`, senão "PDF ainda indisponível"; estado vazio e `loading.tsx`.
    - `/materiais`: Server Component com `export const revalidate = 300`; mesmo JSX e `MaterialCard` (preço via `formatPriceCents`, link Hotmart preservado, `checkoutUrl ?? ""`).
    - Atualização: rotas admin de escrita chamam `revalidateMaterialPages()` (`lib/materials/revalidate.ts` → `revalidatePath("/materiais")`, `/aluno/recursos` e `"/"` — só a página, nunca `"layout"`) apenas após sucesso.
  - Carrossel da home (Etapa 5): `app/page.tsx` (`revalidate = 300`) renderiza `HomeMaterialsCarousel` (Server Component) → `getCarouselItems()` em `lib/materials/pages.ts` → regras puras em `lib/materials/carousel-core.ts`; `MaterialsCarousel` (client) só recebe `items` por prop. Persistência desligada: carrossel estático idêntico ao anterior (`carousel.json`). Ligada: os 10 IDs de `carousel.json` resolvidos em `listPublished()` (despublicados/arquivados somem), ordem = `displayOrder`, título persistido (o título alternativo de `carousel.json` só vale enquanto o título salvo for igual ao original do catálogo), capa persistida com `srcSet` apenas se o nome estiver em `lib/materials/carousel-covers.json` (manifesto = arquivos de `public/materials-covers/`, conferido em teste); senão a imagem original sem `srcSet`. Falha com persistência ligada → aviso "Materiais indisponíveis no momento" só na seção, log apenas com o código; nunca `catalog.json`. Zero itens → seção sem carrossel.

- Gerenciamento de usuários (código pronto; 06 aplicado só no banco local de teste): `/admin/usuarios` com "Novo usuário" (`components/users/NewUserDialog.tsx`) e controle de papel para principais (`UserRoleControl.tsx`); `POST /api/admin/users`, `PATCH /api/admin/users/[id]/role`, `POST /api/account/password`, página `/conta/alterar-senha`; recuperação/designação por `scripts/principal-admin-operator.cjs`. Procedimento: README de `docs/producao-migracao/`, seção 14.
- Liberação manual de acesso (código pronto; 08 aplicado só no banco local de teste; Neon e produção pendentes): service `lib/admin/manual-access-core.ts` (`createManualAccessService(db, { requireAdmin }, now)`; qualquer ADMIN; trava consultiva 61420323; administrador relido na transação; `updatedAt` esperado; P2002 → 409), regras puras e client-safe em `lib/admin/manual-access-rules.ts` (dias de Fortaleza, `endsAt` exclusivo, máximo 366 dias por concessão/renovação, status, resumo da assinatura paga), rota `POST /api/admin/users/[id]/access` (`action`: `grant` | `renew` | `revoke`), cadastro de aluno com `access` opcional na mesma transação (`user-management-core.ts` → `insertGrant`). UI: `components/users/ManualAccessControl.tsx`, campos no `NewUserDialog`, "Assinatura paga" e "Acesso manual" separados em `/admin/usuarios`, métrica "Acessos manuais ativos" em `/admin/dashboard`, cartão `ManualAccessSummary` no dashboard do aluno (`lib/student/manual-access*.ts`). O hash de `lib/auth/authorization-core.ts` em `docs/catalogo/baseline.json` foi atualizado explicitamente para esta mudança. Procedimento: README de `docs/producao-migracao/`, seção 15.

### Pendente
- Usuários: aplicar 06 (branch Neon → produção, cada um com autorização; local já aplicado), designar os dois principais, homologar.
- Liberação manual de acesso: aplicar 08/09 (branch Neon → produção, cada um com autorização, sempre antes de publicar o código; local já aplicado) e homologar (README, seção 15). Desativação de contas e redefinição de senha de terceiros pelo painel ficaram fora do escopo.
- Materiais: provedor Cloudflare R2 em `lib/storage/server.ts` + SDK `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` + env `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` + CORS do bucket (Etapa E), upload de capas, limpeza de assets PENDING abandonados, migração de produção.
- Acesso por compra avulsa de material não é modelado (só assinatura).
- Ativação por email e recuperação de senha.
- Links não protegidos citados em `docs/private-access/README.md` (Google Forms, convite WhatsApp).

### Riscos conhecidos (não corrigidos — exigem decisão)
- Webhook exige `external_reference`, que `create-payment` não envia.
- `create-payment` usa URL ngrok e preço R$ 1 em desenvolvimento.
- Item 014 do catálogo tem `checkoutUrl` vazio (link "Comprar" recarrega a página).
- `scripts/optimize-material-covers.cjs` obsoleto: lia os nomes das capas do código de `MaterialsCarousel.tsx`, que não os contém mais (a fonte é `carousel-covers.json`). Não usar sem reescrever.
- `postinstall` com `prisma generate` não existe apesar do commit `327c082`. O `pnpm-workspace.yaml` ignora os scripts de build do Prisma, então o cliente é gerado pelo script `build` (`prisma generate && next build`); sem isso o `PrismaClient` vira `any`/inexistente e o build da Vercel falha com `implicitly has an 'any' type`.
