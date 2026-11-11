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
| `app/api/` | Route handlers: `auth/[...all]`, `account/session`, `admin/lessons`, `admin/lessons/[id]`, `admin/materials` (+ `[id]`, `[id]/pdf`, `order`), `materials/[id]/download`, `create-payment` (MP), `webhook` (MP). |
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
- Guards (`lib/auth/authorization.ts`): `requireSession()`, `requireAdmin()`, `requireActiveSubscription()`; erro `AuthorizationError` (401 `UNAUTHENTICATED`, 403 `FORBIDDEN` / `SUBSCRIPTION_REQUIRED`).
- Assinatura ativa = `Subscription.status === "active"` e `startDate <= agora < endDate`. Admin **não** recebe assinatura implícita.
- **Regra:** layout protegido não substitui verificação na API; toda operação revalida sessão e permissão no servidor.
- Não alterar o fluxo de autenticação sem necessidade comprovada e autorização.

## 6. Prisma / PostgreSQL

- `prisma/schema.prisma` (provider `postgresql`, `env("DATABASE_URL")`). Modelos: `Lesson`, `User`, `Account`, `Session`, `Verification`, `Plan`, `Subscription`, `Payment`, `Material`, `MaterialAsset`. Enums: `LessonStatus`, `Role`, `MaterialStatus` (DRAFT/PUBLISHED/ARCHIVED), `MaterialAssetStatus` (PENDING/VALIDATED/REJECTED/ARCHIVED).
- **Não há histórico de migrations.** O bloco de materiais foi aplicado **apenas** no banco local `compartilhar_auth_test@127.0.0.1:5432` por `scripts/local-material-catalog.cjs` (recibo em `docs/catalogo/local-persistence.json`). Produção não tem essas tabelas.
- `prisma/proposals/materials.sql` contém CHECKs que o Prisma não expressa (preço ≥ 0, BRL, PDF-only, checksum sha256 para VALIDATED, no máximo 1 asset VALIDATED por material).
- `MaterialAsset → Material` com `onDelete: Restrict`; exclusão de material é lógica (`status = ARCHIVED`).
- Proibido: `prisma migrate reset`, `prisma db push` automático, `DROP`/`TRUNCATE`/deleções em massa, qualquer escrita no Neon/produção. Mudanças de schema = proposta SQL revisável e não destrutiva, aplicada só com autorização.

## 7. Segurança e isolamento de ambientes

- **Nunca** ler, imprimir, copiar ou versionar `.env*`, `.env.auth-test.local`, `.local-auth-admin.json` ou qualquer credencial (`.gitignore` cobre `.env*`). Senhas nunca por argumento, arquivo, env ou chat.
- Desenvolvimento: `pnpm dev` → `scripts/local-auth-admin.cjs dev`, que cria ambiente isolado (snapshot sem `.env*`, banco local validado, `BETTER_AUTH_URL=http://127.0.0.1:3000`, segredo aleatório, `MATERIALS_PERSISTENCE=enabled`). **Não rodar `next dev` direto** (carrega o `.env` raiz → 503). Usar `127.0.0.1`, não `localhost`.
- `scripts/auth-test-safety.cjs` (`validateTarget`/`verifyServer`) só aceita `compartilhar_auth_test_user@127.0.0.1:5432/compartilhar_auth_test`; scripts que tocam banco devem reutilizá-lo.
- `MATERIALS_PERSISTENCE` precisa ser exatamente `"enabled"`; caso contrário `lib/materials/server.ts` falha fechado (503).
- Arquivos privados (PDFs): metadado persistido + endpoint de download autorizado + armazenamento privado. Nada em `public/`, nenhuma URL pública permanente.

## 8. Testes e validação

- Testes unitários: `node --test tests/<arquivo>.test.cjs` (Node `node:test` + `assert/strict`; transpilam TS com `typescript.transpileModule`, sem banco). Não há script `test` nem Jest/Vitest.
  - Seguros sem banco: `material-*.test.cjs`, `materials-carousel`, `private-access`, `lessons`, `auth-preparation`, `auth-test-safety`, `real-login`, `admin-dashboard`, `student-dashboard`.
  - Integração (`auth-integration`, `auth-server`, `local-auth-*`) exigem `.env.auth-test.local` e `--test-concurrency=1`; não rodar contra a conta manual preservada.
- Webhook: `npm run test:webhook`.
- Tipos: `npx tsc --noEmit`. Build: `pnpm build`.
- `npm run lint` **não funciona** (eslint não instalado, sem config).
- Materiais sem banco: `node --test tests/material-pages.test.cjs tests/material-admin-ui.test.cjs tests/material-admin.test.cjs tests/material-catalog.test.cjs tests/material-persistence.test.cjs tests/material-server.test.cjs`.
- `tests/material-catalog.test.cjs` contém guardas intencionais: hashes de ~34 arquivos protegidos (auth, pagamentos, aulas, schema fora do bloco de materiais, layouts); com persistência desligada, `/admin/recursos` e `/aluno/recursos` sem botões/links de download; `/materiais` deve renderizar HTML idêntico ao JSX aprovado em `docs/catalogo/baseline.json` (equivalência de renderização, com persistência desligada e com as 15 linhas semente); conjunto **exato** de rotas de materiais, cada handler com guard, sem Prisma/`storageKey`/env direto; nenhum `.pdf` em `public/`. Atualize as guardas de forma explícita e revisada quando a evolução for aprovada.
- Falha conhecida e anterior a esta etapa: `tests/private-access.test.cjs` ("Existing Prisma schema changed") compara o schema removendo só o bloco de `Lesson`; o bloco de materiais, aplicado antes, quebra o hash. Os cenários com PostgreSQL de `private-access` e `real-login` exigem `.env.auth-test.local` (`AUTH_TEST_TARGET_REJECTED` sem ele).

## 9. Fluxo Git

- `main` = principal; `backup/codigo-local-codex-claude` = recuperação do código local (commit de referência `c575b9c`).
- Desenvolvimento em `feat/<nome>` (atual: `feat/gerenciamento-materiais`).
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
  - **Sem provedor de armazenamento configurado**, upload e download respondem 503 `STORAGE_NOT_CONFIGURED`; nenhum PDF existe ainda, então o download responde 404 `PDF_NOT_AVAILABLE`.
  - Admin (Etapa C): `/admin/recursos` usa `getMaterials().listAdmin()` e renderiza `components/materials/MaterialManager.tsx` (cadastro como rascunho, edição só dos campos alterados, publicar/despublicar, arquivar/restaurar com confirmação, reordenação ↑/↓ via `PUT /order`, status do PDF, aviso de armazenamento indisponível). Com `MATERIALS_PERSISTENCE` desligado (produção hoje) a página mostra `MaterialCatalogReadOnly` (catálogo estático em modo consulta). Helpers client-safe: `lib/materials/price.ts` (centavos ↔ reais, sem float), `lib/materials/admin-client.ts` (payloads, mensagens por status/código, `adminRequest`), `lib/materials/types.ts` (`MaterialAdminView`, `toMaterialAdminView` com whitelist). Capas: apenas imagens locais existentes do catálogo/banco.
  - Biblioteca e vitrine (Etapa D): `lib/materials/pages.ts` (`server-only`) expõe `getLibrary()` (usa `listLibrary()`, que revalida a assinatura) e `getPublicCatalog()` (usa `listPublished()`, sem login), com mapeamento por whitelist. O `catalog.json` só é usado quando `getMaterials()` lança `MATERIALS_PERSISTENCE_DISABLED`; qualquer outro erro propaga para `app/aluno/recursos/error.tsx` / `app/materiais/error.tsx`.
    - `/aluno/recursos`: `requirePageAccess("subscriber")` → `getLibrary()`; página dinâmica; `MaterialLibraryCard` mostra "Baixar PDF" (link para `/api/materials/[id]/download`) só quando `hasPdf`, senão "PDF ainda indisponível"; estado vazio e `loading.tsx`.
    - `/materiais`: Server Component com `export const revalidate = 300`; mesmo JSX e `MaterialCard` (preço via `formatPriceCents`, link Hotmart preservado, `checkoutUrl ?? ""`).
    - Atualização: rotas admin de escrita chamam `revalidateMaterialPages()` (`lib/materials/revalidate.ts` → `revalidatePath("/materiais")` e `/aluno/recursos`) apenas após sucesso.
  - Carrossel da home (`MaterialsCarousel` + `carousel.json`, capas pré-redimensionadas em `public/materials-covers/`) continua estático: um material despublicado/arquivado ainda pode aparecer ali.

### Pendente
- Materiais: carrossel da home ligado à publicação, provedor Cloudflare R2 em `lib/storage/server.ts` + SDK `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` + env `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` + CORS do bucket (Etapa E), upload de capas, limpeza de assets PENDING abandonados, migração de produção.
- Acesso por compra avulsa de material não é modelado (só assinatura).
- Ativação por email e recuperação de senha.
- Links não protegidos citados em `docs/private-access/README.md` (Google Forms, convite WhatsApp).

### Riscos conhecidos (não corrigidos — exigem decisão)
- Webhook exige `external_reference`, que `create-payment` não envia.
- `create-payment` usa URL ngrok e preço R$ 1 em desenvolvimento.
- Item 014 do catálogo tem `checkoutUrl` vazio (link "Comprar" recarrega a página).
- `scripts/optimize-material-covers.cjs` provavelmente obsoleto (lê nomes de `MaterialsCarousel.tsx`).
- `postinstall` com `prisma generate` não existe apesar do commit `327c082`. O `pnpm-workspace.yaml` ignora os scripts de build do Prisma, então o cliente é gerado pelo script `build` (`prisma generate && next build`); sem isso o `PrismaClient` vira `any`/inexistente e o build da Vercel falha com `implicitly has an 'any' type`.
