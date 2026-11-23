# Migração do banco de produção (Neon) para Better Auth

Status (2026-11-15): **homologação completa na branch Neon de ensaio e no Vercel Preview** (seção 4). **Nada aplicado na produção.** Próximo passo: publicar na produção o código com cadastro público fechado (seção 7, passos 1–3) e só então migrar.
Histórico: ensaio local aprovado em 2026-11-11; ensaio na branch `ensaio-better-auth` e login real no Preview aprovados em 2026-11-15.
Base: `main` @ `63380a4`, Better Auth 1.7.17, Prisma 5.10.2. Snapshot anterior: `backup-pre-migracao-better-auth-2026-11-11` (desatualizado: criar um novo imediatamente antes da migração).

## Arquivos

| Arquivo | Tipo | Uso |
|---|---|---|
| `00-inspecao-somente-leitura.sql` | `BEGIN READ ONLY` … `ROLLBACK` | Produção (autorizado) e branch de ensaio |
| `01-auth-better-auth.sql` | DDL aditivo, 1 transação, pré/pós-condições e impressão digital dos dados | Homologado na branch; produção só com autorização |
| `02-lessons.sql` | Cria `lessons` (tabela nova) | Idem |
| `03-pos-verificacao-somente-leitura.sql` | READ ONLY + ROLLBACK | Após 01/02 e após o admin |
| `90-reversao-emergencia.sql` | Remove só objetos novos; aborta se houver dado gravado | Somente emergência autorizada e **somente antes do provisionamento** (seção 9) |
| `04-materials.sql` | DDL aditivo de materiais + importação dos 15 materiais, 1 transação, pré/pós-condições | **Gerado**; não executado em nenhum banco (seção 12) |
| `05-materials-verificacao-somente-leitura.sql` | READ ONLY + ROLLBACK; trava antes de ligar `MATERIALS_PERSISTENCE` | Idem |
| `91-materials-reversao.sql` | Remove só objetos de materiais; aborta se houver PDF ou edição | Somente emergência autorizada (seção 12) |
| `scripts/material-production-sql.cjs` | Gera 04/05/91 a partir de `lib/materials/catalog.json` (offline) | `node scripts/material-production-sql.cjs` confere; `--write` regenera |
| `scripts/migration-rehearsal-local.cjs` | Ensaio local, sempre ROLLBACK | Banco local de testes |
| `scripts/neon-branch-smoke.cjs` | Prisma + Better Auth na branch, sempre ROLLBACK | Branch de ensaio (recusa `production`/`main`) |
| `scripts/provision-production-admin.cjs` | Primeiro ADMIN | Executado só na branch de ensaio; **não executado na produção** |
| `06-admin-users.sql` | DDL aditivo: principais, troca obrigatória de senha, auditoria; 1 transação, pré/pós-condições | Aplicado **somente** no PostgreSQL local de testes; branch Neon e produção **não aplicados** (seção 14) |
| `07-admin-users-verificacao-somente-leitura.sql` | READ ONLY + ROLLBACK; trava de no máximo 2 principais | Idem |
| `92-admin-users-reversao.sql` | Remove só objetos do 06; aborta se houver auditoria, principal ou troca pendente, ou se o 08 existir | Somente antes de qualquer uso, e **depois do 93** (seção 14) |
| `scripts/principal-admin-operator.cjs` | `designate` (principal) e `recover-password` (recuperação sem sessão) | Idem; só após o 06 e com autorização |
| `08-manual-access.sql` | DDL aditivo: concessões manuais de acesso e auditoria própria; 1 transação, pré/pós-condições (inclusive financeiras) | Aplicado **somente** no PostgreSQL local de testes; branch Neon e produção **não aplicados** (seção 15). Depende do 06 |
| `09-manual-access-verificacao-somente-leitura.sql` | READ ONLY + ROLLBACK; contagens e travas de consistência | Idem |
| `93-manual-access-reversao.sql` | Remove só objetos do 08; aborta se houver qualquer concessão ou evento | Somente antes de qualquer uso; sempre **antes do 92** (seção 15) |

### Relatórios locais (`resultados/`)

`docs/producao-migracao/resultados/` está no `.gitignore` e **nunca é versionado**. Ali ficam as saídas do `psql -o` e do smoke (`00-*.txt`, `03-*.txt`, `smoke-ensaio.json`, `ensaio-local-2026-11-11.json`). Contêm apenas estrutura, contagens e hashes, exceto se as consultas `[PII OPCIONAL]` do 00 forem descomentadas. Guarde-os fora do repositório (armazenamento interno do projeto) junto com o registro da janela de manutenção; não os anexe a PRs nem a issues públicas. O mesmo vale para `run*.json`, `.tap` e `regression.json` de `docs/auth-*`.

## 1. Diagnóstico

O código atual usa o Prisma Client do schema novo. Consultas a `users` selecionam `role`, `emailVerified`, `image`, `disabledAt` e `updatedAt`, que o banco antigo não tem. O resultado é erro SQL → 500 → `503 AUTH_UNAVAILABLE` (`lib/auth/http.ts`). As tabelas `auth_*` também faltam. O webhook do Mercado Pago (`tx.user.findUnique`) falha pelo mesmo motivo; a migração corrige isso sem tocar no código de pagamentos.

`lessons` **é necessária** (`/admin/dashboard`, `/admin/aulas`, `/aluno/aulas`). `materials` **não é** enquanto `MATERIALS_PERSISTENCE` não estiver definida na Vercel (o site usa o catálogo estático).

**Estado da Vercel (2026-11-15):** não existe `DATABASE_URL` com escopo **Production**. A única `DATABASE_URL` pertence ao Preview da branch `feat/auth-producao-neon` e aponta para o Neon de ensaio. Consequências:
- até o passo 15 da seção 7, a produção não acessa banco algum (login e sessão respondem 503; o webhook não grava);
- **não é possível validar login ou sessão de produção antes de configurar a conexão oficial e fazer o redeploy** (passos 14–16);
- durante a migração, a aplicação de produção não é uma fonte de escrita concorrente.

## 2. Ensaio local (executado em 2026-11-11)

`node scripts/migration-rehearsal-local.cjs` roda contra `127.0.0.1:5432/compartilhar_auth_test` (validado por `auth-test-safety`), em **uma transação que sempre termina em ROLLBACK**:
1. Cria um schema temporário com o schema **antigo** gerado de `docs/auth-preparation/before.prisma` (`prisma migrate diff`, offline).
2. Insere dados sintéticos com os formatos de risco: e-mail com maiúsculas, par que colide ao normalizar, e-mail com espaço, `name` nulo, `password` legado, id fora do padrão cuid, assinaturas ativa/expirada/cancelada, pagamento sem usuário.
3. Executa os arquivos reais 00 → 01 → 02 → 03 (no ensaio, só `public` vira o schema temporário e `BEGIN/COMMIT` vira `SAVEPOINT`).

| Verificação | Resultado |
|---|---|
| Inspeção 00 detecta os riscos sintéticos | maiúsculas 2, espaço 1, colisão 1 grupo/2 linhas, name nulo 1, password legado 2, id não-cuid 1, pagamento sem usuário 1 |
| Aplicação do 01 | OK em 106 ms; pós-condições aprovadas |
| Impressão digital das colunas antigas (users, plans, subscriptions, payments) | **idêntica** antes/depois |
| Reexecução de 01 / 02 | recusada pela pré-condição (sem efeito) |
| Usuários existentes após 01 | 5/5 `STUDENT`, `emailVerified=false`, `disabledAt` nulo, `updatedAt` preenchido |
| FKs de auth | 2, ambas `ON DELETE RESTRICT` |
| Schema resultante × schema homologado local | **102/102 elementos idênticos** |
| Reversão 90 com conta de auth gravada | recusada pela guarda |
| Reversão 90 sem dados | remove só os objetos novos; dados antigos com impressão idêntica; reaplicação de 01/02 OK |
| Persistência | nenhuma (schema temporário inexistente após o ROLLBACK) |

**Limite do ensaio local:** ele usa o schema antigo *declarado* (`before.prisma`). O schema *real* da produção é confirmado pela inspeção 00 e foi exercitado na branch de ensaio (seção 4).

## 3. Bloqueio do cadastro público (no código; ainda não publicado em produção)

- `lib/auth/config.ts`: `emailAndPassword.disableSignUp = environment.allowSignUp !== true`. `readAuthEnvironment()` **nunca** define `allowSignUp`, então a aplicação recusa `POST /api/auth/sign-up/email` com 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`, antes de qualquer acesso ao banco.
- Só código de servidor confiável liga o cadastro, injetando `allowSignUp: true` na própria instância: o script `create` de provisionamento, os scripts locais e os testes de integração.
- **A `main` publicada hoje (`63380a4`) não tem esse bloqueio.** Se o banco de produção for migrado com ela no ar, qualquer pessoa cria conta (sem verificação de e-mail, inclusive com o e-mail de outra pessoa). Por isso o código com o bloqueio é publicado **antes** da migração (seção 7).
- Ainda **não existe outro caminho de entrada para alunos novos**; ativação/redefinição de senha continua pendente.

## 4. Homologação na branch Neon de ensaio e no Vercel Preview (2026-11-15)

Branch Neon `ensaio-better-auth` (criada de `production`), conexão direta. Preview da Vercel da branch `feat/auth-producao-neon` com `DATABASE_URL` (escopo Preview) apontando para essa branch.

| Etapa | Resultado |
|---|---|
| 00 → 01 → 02 → 03 na branch | aprovados, sem erro; impressões digitais financeiras preservadas |
| `neon-branch-smoke` | `"pass": true` (cadastro público recusado, ciclo de credencial sintética OK, usuários existentes carregados, nada persistido) |
| Provisionamento do ADMIN de ensaio (`create`) | aprovado; conferido pelo 03 |
| Build do Preview | aprovado |
| Login administrativo real | aprovado |
| Sessão após recarregar | mantida |
| Navegação pelas áreas administrativas | aprovada |
| Logout | aprovado |
| Rotas administrativas após logout | bloqueadas |
| Novo login | aprovado |

Pós-verificação final (03) da branch:
- 3 usuários: 1 ADMIN e 2 STUDENT; 1 ADMIN habilitado, e-mail normalizado, credencial válida;
- 1 conta de autenticação com hash de senha; 0 inconsistências de credencial;
- 1 sessão ativa (do último login);
- 3 planos, 1 assinatura, 1 pagamento; nenhuma aula;
- impressões digitais de `plans`, `subscriptions` e `payments` idênticas às anteriores; impressão de `users` idêntica à registrada logo após o provisionamento.

Critérios aplicados: 00 sem objetos novos e com colunas iguais a `before.prisma`; 01 com `COMMIT` sem erro; 03 com contagens e seção 7 iguais à seção 18 do 00; smoke `"pass": true`.

Comandos usados no ensaio (referência; a branch de ensaio deve ser apagada no Neon Console após o fim da janela de segurança da produção):

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$branch = "host=<ep-ensaio>.neon.tech dbname=<banco> user=<usuario> sslmode=require"
& $psql $branch -v ON_ERROR_STOP=1 -f 00-inspecao-somente-leitura.sql -o resultados\00-ensaio-antes.txt
& $psql $branch -v ON_ERROR_STOP=1 -f 01-auth-better-auth.sql
& $psql $branch -v ON_ERROR_STOP=1 -f 02-lessons.sql
& $psql $branch -v ON_ERROR_STOP=1 -f 03-pos-verificacao-somente-leitura.sql -o resultados\03-ensaio-depois.txt
node scripts\neon-branch-smoke.cjs   # pede branch, conexão e confirmações em entrada oculta
```

## 5. Conflitos com dados existentes

1. **E-mails com maiúsculas ou espaços** (seções 9/9b do 00). O Better Auth procura `lower(email)` com igualdade exata, então essas contas não entram nem redefinem senha. A decisão sobre normalizar fica para depois da inspeção. O provisionamento recusa `create` para e-mail existente em qualquer grafia (não duplica usuário) e recusa `link-existing` se o e-mail gravado não estiver normalizado.
2. **Usuários antigos sem credencial.** O `users.password` antigo nunca é lido nem copiado. O caminho legítimo é a redefinição de senha (o Better Auth cria a credencial ausente), que depende de um provedor de e-mail ainda pendente.
3. **`name` nulo e `updatedAt`** recebem o instante da migração. Validado: o Better Auth carrega esses registros sem erro.
4. **IDs e vínculos preservados.** A migração não altera `users.id`, assinaturas nem pagamentos (impressão digital). O `link-existing` mantém o id e as assinaturas, o que é verificado dentro da transação.

## 6. Primeiro administrador — `scripts/provision-production-admin.cjs`

Modos: `create` (e-mail novo) e `link-existing` (usuário antigo; preserva id, assinaturas e pagamentos).

1. Terminal interativo. Conexão, e-mail e senha em **entrada oculta** (nunca em argumento, env, arquivo ou log). Recusa host local, pooler e conexão sem TLS. Exige redigitar o nome do banco e o id do endpoint, e digitar `PROVISIONAR`.
2. Antes de pedir credenciais, confere que o 01 foi aplicado e que não existe ADMIN.
3. Uma transação com `pg_advisory_xact_lock`: recusa se existir ADMIN; `create` cadastra pelo Better Auth no servidor (`allowSignUp` só nessa instância); `link-existing` cria uma única credencial `credential`/`accountId = users.id`; confere as invariantes; **prova o login** antes de conceder privilégio; promove a ADMIN, apaga as sessões criadas e confere que existe exatamente 1 ADMIN. Qualquer falha reverte tudo.
4. Imprime só o id. Senha do admin: 12 a 128 caracteres.

O script conecta diretamente ao Neon; não depende das variáveis da Vercel.

## 7. Sequência operacional da produção

Cada passo só com autorização explícita. Registre data/hora, executor e resultado de cada passo.

**Publicação do bloqueio (sem tocar no banco)**
1. Integrar à `main` o código com cadastro público bloqueado (PR revisado).
2. Publicar esse código na Vercel Production. Sem `DATABASE_URL` de produção, o comportamento visível não muda: páginas públicas funcionam; login responde 503 como hoje.
3. Confirmar o bloqueio no domínio oficial: `POST /api/auth/sign-up/email` deve responder **400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`** (ou **503 `AUTH_UNAVAILABLE`** se `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` ainda não existirem em Production; em ambos os casos nenhuma conta é criada). Registre qual dos dois. Confirme também que o deploy de Production corresponde ao commit aprovado.

**Preparação (somente leitura)**

4. Confirmar no Neon Console a branch `production` e o host **direto** (sem `-pooler`); anotar o id do endpoint e o nome do banco.
5. Executar o 00 e guardar a saída em `resultados/`. Conferir: seção 3 (objetos novos ausentes), 4 (colunas = `before.prisma`), 16 (o usuário SQL é dono das tabelas), 17 (sem locks/transações longas). Anotar seção 8 (contagens) e 18 (impressões digitais).

**Janela de manutenção**

6. Backup imediatamente antes: criar branch Neon a partir de `production` (`backup-pre-migracao-<AAAAMMDD-HHMM>`) e anotar o horário exato (referência de PITR). **Verificar a retenção de histórico (PITR) do projeto no Neon** e confirmar que cobre a janela e o período de observação; se não cobrir, a branch de backup é o único ponto de recuperação — mantenha-a até o fim do período de observação.
7. Coordenar a janela e o controle de escritas concorrentes: horário de baixo movimento; ninguém usando o SQL Editor ou scripts contra a produção; a aplicação não grava (sem `DATABASE_URL` de Production até o passo 14). Se uma escrita concorrente ocorrer mesmo assim, a pós-condição do 01 falha e toda a transação é revertida (falha segura); repetir após conferir.
8. Executar `01-auth-better-auth.sql`.
9. Executar `02-lessons.sql`.
10. Executar `03-pos-verificacao-somente-leitura.sql`.
11. Comparar: seção 2 do 03 = seção 8 do 00; seção 7 do 03 = seção 18 do 00; seção 3 só com `STUDENT`; `auth_*` vazias; `lessons` vazia. Qualquer divergência: parar e analisar (seção 9).

**Administrador**

12. Provisionar o ADMIN definitivo (`create` ou `link-existing`), com autorização.
13. Executar o 03 novamente: exatamente 1 ADMIN habilitado, com credencial e e-mail em minúsculas; `plans`, `subscriptions` e `payments` com impressão idêntica; `users` idêntica (`link-existing`) ou com +1 linha (`create`).

**Conexão da aplicação**

14. Configurar `DATABASE_URL` com escopo **Production**, apontando para a branch oficial `production` do Neon (mesmo formato de URL homologado no Preview, com `sslmode=require`). Conferir que a `DATABASE_URL` do Preview continua restrita ao Preview e que `BETTER_AUTH_SECRET` (≥ 32 caracteres) e `BETTER_AUTH_URL` (https, domínio oficial) existem em Production. **Não** definir `MATERIALS_PERSISTENCE` em Production.
15. Fazer o redeploy de produção (variáveis só valem para deploys novos).
16. Validar no domínio oficial: login do ADMIN, sessão após recarregar, navegação em `/admin/*`, logout, `/admin` bloqueado após logout, novo login, cadastro público ainda recusado (400), `/materiais` com o catálogo estático. **Antes dos passos 14–15 esta validação não é possível.**
17. Integrações financeiras, sem cobrança real: impressões digitais de `payments`/`subscriptions` inalteradas (passo 13); `POST /api/webhook` sem assinatura → 401; `/checkout` renderiza (não concluir pagamento). No painel do Mercado Pago, revisar as **notificações de webhook pendentes ou com falha** do período em que a produção não tinha banco: listar os pagamentos aprovados sem assinatura correspondente e decidir o reprocessamento com autorização (o webhook é idempotente; reenvios do provedor podem conceder acesso após o passo 15).

## 8. Rollback da aplicação (Vercel)

- Instant Rollback é seguro para qualquer deploy **posterior ao passo 2** (código com cadastro fechado). O schema é aditivo e compatível com esse código.
- **Voltar para `63380a4` (ou qualquer deploy anterior ao bloqueio) depois do passo 8 reabre o cadastro público** sobre um banco funcional. Se for inevitável, bloquear antes `POST /api/auth/sign-up/*` (ex.: regra no Firewall da Vercel) e registrar a decisão.
- Remover/alterar `DATABASE_URL` de Production desliga o acesso ao banco (login volta a 503) sem tocar nos dados; exige redeploy.

## 9. Recuperação do banco (Neon)

| Situação | Ação |
|---|---|
| Erro em 01/02 | A transação reverte sozinha. Corrigir a causa e repetir a partir do passo 5 |
| Divergência no 03 sem dados novos | Parar; comparar com o 00; se necessário, usar o 90 (abaixo) ou a branch de backup |
| Suspeita sobre os dados | Restaurar backup/PITR numa **branch nova** e comparar com a impressão digital do 00. Nunca sobrescrever `production` sem análise |
| Restauração total da `production` | Só com autorização. Antes, exportar `payments`/`subscriptions`/`users` gravados depois do backup (webhooks reprocessados, provisionamento) para reconciliar |
| Remover objetos novos | `90-reversao-emergencia.sql`, nas condições abaixo |

**Restrições do 90:** ele só remove objetos criados por 01/02 e aborta se existir qualquer linha em `auth_accounts`, `auth_sessions` ou `auth_verifications`, qualquer usuário com papel diferente de `STUDENT` ou valores de autenticação gravados, ou qualquer aula. **Depois do provisionamento do ADMIN (passo 12) o 90 deixa de ser aplicável** — o caminho passa a ser exclusivamente backup/PITR em branch nova. Nunca editar as guardas do 90 para forçar a execução.

## 10. Estado dos testes (2026-11-15, branch `feat/auth-producao-neon`)

| Verificação | Resultado |
|---|---|
| Testes sem banco (15 suítes: materiais, aulas, auth, provisionamento, smoke, dashboards) | 102/102 |
| Cenários estáticos de `private-access` e `real-login` | 2/2 |
| `node scripts/local-auth-regression.cjs` (auth-server, real-login, private-access com PostgreSQL local) | 42/42; registros preservados |
| `npm run test:webhook` | 58/58 |
| `npx tsc --noEmit` / `prisma validate` / `next build` | sem erros |
| `npm run lint` | **não executável**: eslint não instalado e sem configuração (limitação conhecida) |

Correções desta etapa (só testes/fixtures, sem mudança funcional): `private-access` passou a remover também o bloco autorizado de materiais (igual a `prisma/proposals/materials.prisma`) antes de comparar o hash original do schema, que não mudou; `.gitattributes` força LF; 12 hashes de referência foram recalculados após provar que a única diferença era o fim de linha; `real-login` compara o JSX sem considerar CRLF/LF.

## 11. Pendente de autorização

1. PR e merge na `main`; publicação em Production (seção 7, passos 1–3).
2. Migração da produção (passos 4–11).
3. Provisionamento do ADMIN definitivo (passos 12–13).
4. `DATABASE_URL` de Production e redeploy (passos 14–17).
5. Decisão sobre normalização de e-mails, após o resultado do 00.
6. Apagar a branch de ensaio e, ao fim do período de observação, a branch de backup.

## 12. Materiais — 04/05/91 (preparado em 2026-11-18; **nada executado**)

Status: arquivos gerados e cobertos por testes offline (`tests/material-production-sql.test.cjs`). **Nenhum SQL foi executado** em banco algum (nem local, nem branch, nem produção). `MATERIALS_PERSISTENCE` continua **ausente** na Vercel.

### Efeito esperado sobre os 15 materiais

| | Quantidade | IDs |
|---|---|---|
| Materiais originais no `catalog.json` | **15** | `material-initial-001` … `015` |
| Importados como `PUBLISHED` (aparecem em `/materiais` e `/aluno/recursos`) | **14** | todos, exceto o 014 |
| Importados como `DRAFT` (visíveis só no admin) | **1** | `material-initial-014` — "Termômetro das Emoções" |

- **Por que o 014 é DRAFT:** o link Hotmart dele está vazio no catálogo, e a regra do backend (Etapa 1) proíbe publicar sem link. Os dados comerciais dele são importados **sem alteração** (título, R$ 4,90, capa, posição 13 e `checkoutUrl = ""`). Para ele voltar à vitrine, o admin informa o link real em `/admin/recursos` e publica.
- **Diferença visível na vitrine:** hoje (catálogo estático) `/materiais` mostra 15 cards; depois de ligar a persistência mostra **14**. O 014 deixa de aparecer, o que também elimina o botão "Comprar" que hoje só recarrega a página. A ordem dos outros 14 não muda.
- **A revisar por você (nada foi alterado):** os itens 005 ("História na Caixa…") e 006 ("Intrusos - Letra Inicial") usam o **mesmo** link Hotmart (`…/P104313546Q`). Foram importados como estão.
- Nada é inventado: id, título, preço (texto → centavos sem ponto flutuante), capa, link, Premium e ordem vêm do `catalog.json`. A descrição é nula, como no catálogo, e a moeda é `BRL`.

### Regras de importação

- **Idempotente:** `INSERT … ON CONFLICT ("id") DO NOTHING`; um material existente nunca é sobrescrito.
- **Tudo ou nada:** no executor local (`scripts/local-material-catalog.cjs`), qualquer id já existente com valores diferentes (`MATERIAL_IMPORT_CONFLICT`, com id e campos) ou id duplicado (`DUPLICATE_MATERIAL_ID`) aborta a transação antes de qualquer `INSERT`.
- **Registros extras** (criados pelo admin, fora do catálogo) são listados e nunca tocados.
- **Em produção o 04 recusa rodar se as tabelas já existirem**, então não há base parcial possível ali. A idempotência e o tudo-ou-nada valem para o executor local e para reexecuções acidentais.

### O que cada arquivo faz

- **04** (uma transação, `lock_timeout 5s`, advisory lock):
  - pré-condições: 01/02 aplicados, objetos de materiais ausentes;
  - registra impressões digitais de `users`, `plans`, `subscriptions`, `payments`, `lessons` e `auth_accounts`;
  - cria a estrutura idêntica a `prisma/proposals/materials.sql` (enums, tabelas, índices, FK `RESTRICT`, 7 CHECKs, índice parcial);
  - importa os 15 materiais;
  - pós-condições: 15 linhas, 14 `PUBLISHED`, só o 014 em `DRAFT`, valores idênticos ao catálogo linha a linha (pega erro de codificação UTF-8), `material_assets` vazia, 10 restrições, 7 índices, enums corretos e impressões digitais inalteradas.
  - `auth_sessions`/`auth_verifications` ficam de fora das impressões de propósito: logins durante a janela as alteram legitimamente, e o 04 não as referencia. O 04 roda em **`REPEATABLE READ`**: as impressões de antes e de depois usam o mesmo snapshot, então escritas concorrentes legítimas (webhook em `payments`/`subscriptions`, login) **não** abortam a migração. Uma alteração feita pelo próprio 04 nessas tabelas continua sendo detectada e reverte tudo. Ainda assim, rodar em horário de baixo movimento.
- **05** (somente leitura): mostra contagens e divergências nos dois sentidos e termina com uma **trava** que levanta exceção se algo divergir. É o portão para ligar a persistência. Depois que o admin começar a editar, as divergências passam a refletir as edições.
- **91** (emergência): `LOCK` exclusivo; aborta se houver qualquer linha em `material_assets` ou se os materiais não forem exatamente os 15 do 04 sem edição; remove só `material_assets`, `materials` e os dois enums.

### Sequência proposta (cada passo exige autorização; nada disto foi feito)

1. **Ensaio local** (Etapa 4): 04 → 05 → 91 num schema temporário do banco local, sempre com ROLLBACK, como o `scripts/migration-rehearsal-local.cjs`.
2. **Ensaio em branch Neon** (PostgreSQL 17, igual à produção; o local é 18): criar a branch a partir de `production`, rodar 04 e 05 e testar no Preview com `MATERIALS_PERSISTENCE=enabled` **somente no escopo Preview**.
3. **Backup:** branch `backup-pre-materiais-<AAAAMMDD-HHMM>` e confirmar a janela de PITR.
4. **Produção:** rodar 04, depois 05. **Só seguir se o 05 terminar sem a exceção da trava.**
5. Definir `MATERIALS_PERSISTENCE=enabled` em Production e fazer o redeploy.
6. Conferir:
   - `/materiais`: 14 cards, mesma aparência;
   - `/aluno/recursos` com um aluno assinante;
   - `/admin/recursos` com 15 materiais, incluindo o 014 como rascunho.
7. **Trava operacional:** com a persistência ligada **não existe fallback automático** para o `catalog.json`. Se as tabelas faltarem ou o banco falhar, as páginas caem no `error.tsx`, de forma controlada. O catálogo estático só é usado com a persistência desligada.

### Recuperação

| Situação | Ação |
|---|---|
| Erro no 04 | A transação reverte sozinha; nada é aplicado. Analisar e repetir |
| 05 falha (trava) | **Não ligar a persistência.** Analisar a divergência. Se for preciso desfazer, usar o 91 (ainda sem edições) |
| Problema depois de ligar a persistência | Remover `MATERIALS_PERSISTENCE` e fazer o redeploy: o site volta ao catálogo estático **sem tocar no banco** (caminho preferido) |
| Remover a estrutura | Primeiro desligar a persistência (linha acima); então o 91, que só funciona sem PDFs e sem edições |
| Já houve edições ou PDFs | O 91 recusa. Usar a branch de backup/PITR numa **branch nova** e comparar; nunca editar as guardas do 91 |

### Limitações conhecidas

- 04/05/91 foram executados **apenas no ensaio local em PostgreSQL 18.6** (abaixo). Falta o PostgreSQL 17 (Neon).
- **O banco local de testes tem o 014 como `PUBLISHED`** (importação de 2026-11-06, regra anterior); os dados comerciais dele são idênticos ao catálogo. Com a regra nova, um `--import` local abortaria com `MATERIAL_IMPORT_CONFLICT` (014, `status`). `scripts/verify-local-material-catalog.cjs` ainda usa o contrato antigo (`result.conflicts`) e falharia. A reconciliação e o ajuste estão **propostos, não executados**.

### Ensaio local (Etapa 4, 2026-11-18) — `node scripts/material-migration-rehearsal-local.cjs`

Alvo validado por `auth-test-safety`: `compartilhar_auth_test` / `compartilhar_auth_test_user` @ `127.0.0.1:5432`, PostgreSQL 18.6.

O ensaio tem três fases:
- **A:** somente leitura (`SET TRANSACTION READ ONLY`).
- **B:** schema temporário `rehearsal_<hex>` com o schema legado, dados sintéticos e os 01/02 reais, depois 04/05/91.
- **C:** service real com autorização real sobre o `public` local.

B e C rodam cada uma numa única transação que **sempre termina em ROLLBACK**. Ao final o script confere: nenhum schema `rehearsal_*` restante e impressões digitais de linha inteira de `materials`, `material_assets`, `users`, `subscriptions`, `plans` e `payments` idênticas às de antes. `--read-only` roda só a fase A. O relatório fica em `resultados/ensaio-materiais-local-<data>.json`, que não é versionado.

| Verificação | Resultado |
|---|---|
| Aplicação do 04 | OK em ~70–90 ms; 15 linhas, 14 PUBLISHED, DRAFT = `material-initial-014`, **valores idênticos ao catálogo** (acentos e emoji incluídos) |
| Impressões digitais legadas após o 04 | idênticas |
| Reexecução do 04 | recusada: `PRECONDITION: tabelas de materiais já existem` |
| Falha segura do 04 (comando injetado no meio do arquivo) | escrita em `payments` → `POSTCONDITION: dados de payments alterados`; valor importado alterado → `POSTCONDITION: valores importados divergem`; nenhum objeto restante após o aborto |
| 05 | trava aprovada; PUBLISHED 14 / DRAFT 1; 0 divergências; 0 assets |
| Trava do 05 bloqueia | 014 publicado, preço alterado, linha ausente → `TRAVA: … NÃO ligar MATERIALS_PERSISTENCE` |
| Restrições PostgreSQL (14 casos) | preço < 0, moeda ≠ BRL, ordem < 0, enum inválido, não-PDF, tamanho 0, versão 0, VALIDATED sem checksum, 2 VALIDATED por material, FK inexistente, apagar material com asset (RESTRICT), `storageKey` duplicada, versão duplicada, `updatedAt` nulo: **todos recusados**; asset PENDING válido aceito |
| Importação (planner sobre linhas reais) | base completa: 0 a criar / 15 preservados; reexecução do INSERT: 0 linhas; base parcial (003, 009, 014 removidos): cria só os 3 e restaura valores idênticos; 014 alterado → `MATERIAL_IMPORT_CONFLICT` (014, `status`); extra preservado e intocado |
| 91 | recusado com asset, com material editado e com material extra (`GUARD`); sem dados novos remove só os 2 tabelas + 2 enums, mantém as 5 tabelas legadas com impressões idênticas; 04 reaplicável depois |
| Service ADMIN (PostgreSQL real) | cria DRAFT; capa inexistente 400; publicar sem link 422 com linha intacta; publicar com link OK; edição desatualizada 409 sem alterar a linha; apagar link de publicado 422; id malformado 404; reorder incompleto 409; reorder, arquivar e restaurar refletem em `listPublished` |
| Anônimo / STUDENT sem assinatura / **STUDENT com assinatura ativa** | as 8 operações administrativas → 401 / 403 / 403; dados de materiais **inalterados** |
| Biblioteca | assinante OK (15 itens no local); STUDENT sem assinatura → 403 `SUBSCRIPTION_REQUIRED` |
| Persistência | `persisted: false`; dados de `public` idênticos; 0 schemas `rehearsal_*` |

**Achado do ensaio, não é defeito da aplicação:** o Prisma 5 fixa o instante do `@updatedAt` uma vez por **transação interativa**. Medido: o valor fica constante dentro dela, e duas transações separadas diferiram em 294 ms. Como o ensaio roda tudo numa transação, uma segunda edição não avançava o `updatedAt`. Na aplicação, cada requisição é uma transação própria, então a concorrência otimista funciona. O ensaio simula a edição de outra sessão avançando o `updatedAt` e confirma o 409.

**Limites do ensaio:**
- No ensaio o `BEGIN ISOLATION LEVEL REPEATABLE READ` vira SAVEPOINT. O benefício contra escritas de **outra sessão** só pode ser demonstrado na branch Neon, com uma segunda conexão.
- PostgreSQL 17 não está instalado localmente. A revisão estática não encontrou recurso exclusivo do 18, e a contagem de restrições filtra `p/f/c` porque o 18 também lista NOT NULL. Mesmo assim falta execução real em 17.
- As mensagens do servidor local estão em português. As verificações de restrição usam o nome da constraint ou a chave, nunca o texto traduzido.

### Proposta de reconciliação do 014 no banco local (NÃO executada)

O banco local tem `material-initial-014` como PUBLISHED com `checkoutUrl = ""`. Os demais campos estão idênticos ao catálogo e não há assets.

Proposta, sujeita à sua autorização:
1. `pg_dump` local, como faz `local-material-catalog.cjs`.
2. Uma transação com guarda, que só altera se o estado for exatamente o atual e não muda nenhum dado comercial:
   ```sql
   UPDATE public.materials SET status = 'DRAFT', "updatedAt" = CURRENT_TIMESTAMP
   WHERE id = 'material-initial-014' AND status = 'PUBLISHED' AND "checkoutUrl" = '';
   -- esperar exatamente 1 linha; caso contrário, ROLLBACK
   ```
3. Rodar `--read-only` para confirmar 0 conflitos.

Alternativa sem SQL manual: em `pnpm dev`, como ADMIN, despublicar o 014. O service aceita, porque a regra só bloqueia publicar sem link.

Ajuste também proposto: atualizar `scripts/verify-local-material-catalog.cjs` para o contrato novo (`MATERIAL_IMPORT_CONFLICT` em vez de `result.conflicts`).

## 13. Contas adicionais: segundo ADMIN e aluno (preparado em 2026-11-18; **nada executado**)

Script: `scripts/provision-production-account.cjs`, com os modos `admin` e `student`. O primeiro ADMIN continua sendo criado só por `scripts/provision-production-admin.cjs` (inalterado; recusa se já existir ADMIN). Testes offline: `tests/provision-account.test.cjs`.

### Garantias

- **Sem `.env`, sem segredos na saída.** A conexão, o nome, o e-mail e a senha são digitados em **entrada oculta**: nunca em argumento, variável de ambiente, arquivo ou log. A saída mostra só o id e o papel.
- **Destino confirmado.** Só aceita conexão Neon **direta** (sem `-pooler`) com `sslmode=require`; o script acrescenta `sslaccept=strict` (certificado e host verificados) e recusa `verify-full`/`verify-ca`, que o Prisma 5.10 trata como `prefer` (ver "Validação de TLS" abaixo). O operador redigita o nome do banco e o id do endpoint. A checagem do schema de auth, só leitura, acontece antes de qualquer dado pessoal ser pedido.
- **Só conta nova.** E-mail existente, em qualquer combinação de maiúsculas, é recusado (`EMAIL_ALREADY_REGISTERED`). No modo `student`, um e-mail com pagamento antigo exige análise humana (`EXISTING_FINANCIAL_RECORD_REVIEW_REQUIRED`). Nenhuma conta existente é alterada: impressões digitais de todos os outros usuários e credenciais, e de `plans`, `subscriptions` e `payments`, precisam ser idênticas no fim. Caso contrário, `OTHER_ACCOUNTS_CHANGED` e rollback.
- **Credenciais só pelo Better Auth.** Cadastro no servidor (mesmo hash scrypt), habilitado apenas na instância deste processo; o cadastro público da aplicação continua fechado. Depois, um **login real** (`signInEmail`) prova a credencial antes de concluir, e as sessões dessa prova são apagadas.
- **Uma transação PostgreSQL para tudo.** O Better Auth recebe apenas o cliente de transação interativa do Prisma. O adaptador dele só abre transação própria se a opção `transaction` estiver ligada (não está) ou se o cliente tiver `$transaction`, e o Prisma 5 remove esse método do cliente de transação. Toda escrita do Better Auth acontece dentro da transação ou falha. Isso é conferido em tempo de execução (`TRANSACTION_CLIENT_REQUIRED`) e fixado por um teste de contrato contra o código instalado, que falha se uma atualização do Better Auth ou do Prisma mudar esse comportamento.
- **Concorrência.**
  - Trava consultiva compartilhada com o script do primeiro ADMIN.
  - No modo `admin`, o operador confirma a quantidade atual de ADMIN, que precisa continuar igual dentro da transação (`ADMIN_COUNT_CHANGED_REVIEW_REQUIRED`) e terminar em +1.
  - Escritas concorrentes legítimas (webhook, edição de perfil) durante a execução fazem a verificação de impressão digital falhar; a transação reverte, e basta repetir. É uma falha segura.
- **Papéis.**
  - `admin`: a conta nasce STUDENT e só é promovida a ADMIN no servidor, depois da prova de login.
  - `student`: termina STUDENT, **sem assinatura, plano ou pagamento**. A opção 1, decidida em 2026-11-18: as áreas de assinante continuam bloqueadas para essa conta.

### Dados necessários (digitados no terminal, nunca no chat)

1. Conexão Neon direta (`postgresql://…@ep-<id>.<região>.aws.neon.tech/<banco>?sslmode=require`), nome do banco e id do endpoint.
2. Para cada conta: nome, e-mail e senha (ADMIN: 12 a 128 caracteres; aluno: 8 a 128).
3. Modo `admin`: a quantidade atual de administradores (hoje 1, conferida pelo script).

### Procedimento (cada passo exige autorização própria)

1. **Ensaio em branch Neon.** Criar a branch `ensaio-contas-<AAAAMMDD>` a partir de `production` e usar a conexão **direta** dela.
   - Rodar `node scripts/provision-production-account.cjs admin` e depois `… student`, com e-mails de ensaio.
   - Executar o 03 na branch.
   - Testar login, logout e bloqueios num Preview apontado para a branch, se disponível.
   - Apagar a branch ao final.
2. **Backup imediatamente antes.** Criar a branch `backup-pre-contas-<AAAAMMDD-HHMM>` a partir de `production`, anotar o horário (referência de PITR) e confirmar a retenção do histórico.
3. **Antes de executar:** rodar o 03 (somente leitura) e guardar a saída em `resultados/` (não versionado). Anotar as contagens e as impressões digitais.
4. **Execução em produção:** um terminal interativo **local**, um modo por vez:
   - `! node scripts/provision-production-account.cjs admin`
   - redigitar banco e endpoint, confirmar a quantidade de ADMIN, digitar nome, e-mail, senha e confirmação, e depois `PROVISIONAR`;
   - saída esperada: `ADMIN provisionado: <id>`.
   - `! node scripts/provision-production-account.cjs student`
   - mesma sequência, sem a contagem de ADMIN;
   - saída esperada: `STUDENT provisionado: <id>` e o aviso de que a conta não tem assinatura.
5. **Em caso de erro:** o script mostra só um código fixo e a transação foi revertida. Não insistir sem entender o código: `EMAIL_ALREADY_REGISTERED`, `ADMIN_COUNT_CHANGED_REVIEW_REQUIRED` e `OTHER_ACCOUNTS_CHANGED` pedem análise.

### Verificações posteriores

- **03 (somente leitura):**
  - 2 ADMIN, todos com credencial, e-mail em minúsculas e habilitados;
  - `users` com +2 linhas e `auth_accounts` com +2;
  - impressões digitais de `plans`, `subscriptions` e `payments` **idênticas** às do passo 3.
- **No domínio oficial, cada conta numa janela anônima:**
  - **novo ADMIN:** login vai para `/admin/dashboard`; navegar por `/admin/*`; recarregar mantém a sessão; logout; `/admin` bloqueado depois do logout;
  - **aluno:** login vai para `/aluno/dashboard`;
  - **aluno em rotas administrativas:** `/admin/*` redireciona para `/login?reason=access-denied`; `GET /api/admin/materials` e `GET /api/admin/lessons` respondem 403;
  - **aluno em áreas de assinante:** `/aluno/aulas`, `/aluno/recursos`, `/aluno/supervisoes` e `/aluno/solicitar-supervisao` pedem assinatura (sem assinatura ativa, por decisão);
  - **cadastro público:** `POST /api/auth/sign-up/email` continua respondendo 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
- **Painel admin:** "Usuários" lista as 2 contas novas com os papéis corretos; "Assinaturas ativas" não muda.

### Recuperação

- **Conta criada por engano:** não existe exclusão pela aplicação (`deleteUser` desligado, FKs `RESTRICT`). O caminho seguro é desativar a conta (`disabledAt`), o que bloqueia login e sessões existentes, por um procedimento próprio e autorizado. Como alternativa, comparar com a branch de backup. Nunca apagar linhas à mão.
- **Senha esquecida:** ainda não existe redefinição por e-mail (pendente). Não alterar credenciais diretamente no banco.

### Ensaio em branch Neon descartável: `scripts/neon-account-rehearsal.cjs` (preparado; ainda não executado)

Roda **no terminal do operador** (entrada oculta; nada passa pelo chat). Antes de qualquer escrita, recusa e para (`fail closed`) se:
- a branch se chamar `production`, `main`, `prod` ou `master`;
- o id do endpoint de **production** (copiado do console Neon) não for informado ou for igual ao do destino;
- a conexão for pooler, local ou sem `sslmode=require`;
- o nome do banco e o endpoint não forem redigitados iguais;
- **o TLS do cliente até o Neon não for comprovado**, antes de qualquer SQL (`scripts/neon-tls.cjs`, ver abaixo);
- numa transação `READ ONLY`, o banco for outro, o schema não for `public`, a sessão não for TLS nem o salto interno do proxy Neon, o destino for réplica de leitura, o servidor não for Neon ou o schema de auth não estiver migrado.

O operador revisa as evidências impressas e digita `ENSAIO`.

#### Validação de TLS (corrigida em 2026-11-19)

**Problema.** A versão anterior exigia `pg_stat_ssl.ssl = true` e falhava com `TARGET_TLS_NOT_ACTIVE`. No Neon, o cliente fala com um **proxy**; o Postgres só enxerga o trecho interno proxy → compute, que não usa TLS. Por isso `pg_stat_ssl` mostra `ssl = false` e um endereço privado mesmo quando a conexão do cliente é TLS. O diagnóstico somente leitura `node scripts/neon-tls-diagnostic.cjs`, executado na branch `ensaio-contas-20261118`, retornou `CHECK_MEASURES_PROXY_HOP_CONNECTION_IS_TLS`.

**Comportamento efetivo do Prisma 5.10.** Medido offline contra um servidor falso em 127.0.0.1 com certificados descartáveis (`tests/prisma-tls-behavior.test.cjs`):

| URL | Servidor recusa TLS | Certificado autoassinado | Cadeia válida, outro host |
|---|---|---|---|
| `sslmode=require` | recusa | **aceita** | — |
| `sslmode=require&sslaccept=strict` | recusa | recusa | recusa |
| `sslmode=verify-full` ou `verify-ca` | **conecta sem TLS** | **aceita** | — |

`verify-full` e `verify-ca` não existem no Prisma e equivalem a `prefer`. Por isso `scripts/neon-target.cjs` (usado pelo ensaio e pelos dois scripts `provision-production-*`) agora:
- aceita apenas `sslmode=require`, sem repetição do parâmetro;
- acrescenta `sslaccept=strict` à URL entregue ao Prisma e recusa qualquer outro valor;
- recusa `sslcert`, `sslidentity` e `sslpassword`, para usar apenas o repositório de certificados do sistema.

**Prova exigida antes de qualquer SQL** (todas as condições; qualquer falha encerra o ensaio sem escrita):
1. a URL do Prisma tem `sslmode=require&sslaccept=strict` (`TARGET_TLS_DRIVER_NOT_STRICT`);
2. sondagem TLS no mesmo host: o Neon responde ao pedido de SSL e o handshake TLS 1.2 ou superior valida cadeia e nome do host (`TARGET_TLS_NOT_ACTIVE` / `TARGET_TLS_CERTIFICATE_UNVERIFIED`). A sondagem não envia usuário, banco nem senha;
3. sondagem sem TLS: o Neon recusa uma conexão sem TLS feita com um usuário fictício e sem senha (`TARGET_ACCEPTS_PLAINTEXT` / `TARGET_PLAINTEXT_REFUSAL_UNPROVEN`). Se o servidor pedir senha, o socket é fechado sem responder.

Depois, na transação somente leitura, `pg_stat_ssl` e `pg_stat_activity` da própria sessão são lidos. São aceitos só `ssl = true` ou `ssl = false` vindo de endereço privado num servidor Neon (o salto do proxy). Um endereço público sem TLS continua bloqueando com `TARGET_TLS_NOT_ACTIVE`. As evidências impressas trazem `tls.client` (protocolo, cifra, certificado e host verificados, recusa sem TLS) e `tls.session`.

**Fora do escopo desta correção:** a `DATABASE_URL` da aplicação na Vercel usa `sslmode=require` sem `sslaccept=strict`. Pelo contrato acima, essa conexão não valida o certificado. Mudar isso exige decisão e autorização à parte.

**Isolamento:** uma branch Neon é uma cópia copy-on-write; escritas nela não chegam à branch de origem. A ferramenta comprova que o destino **não é o endpoint de production**, mas não lê a production, o que não está autorizado. A confirmação de que o endpoint pertence à branch de ensaio vem do console Neon (página da branch → Compute → endpoint id).

**O que executa**, com identidades fictícias `ensaio-…@example.invalid` e senhas aleatórias geradas e mantidas só em memória:
1. **Rollback em 5 pontos.** Cada um confere que os dados preexistentes ficaram idênticos e que nenhuma conta de ensaio sobrou:
   - falha no login de prova;
   - falha depois das escritas do Better Auth (usuário, credencial e sessão);
   - falha depois da promoção a ADMIN;
   - transação expirada (35 s);
   - **processo morto (`SIGKILL`)** no meio da transação, aguardando a liberação da trava consultiva.
2. **Duplicidade e contagem.** E-mail preexistente em MAIÚSCULAS e contagem de ADMIN errada: ambos recusados antes de o Better Auth rodar.
3. **Concorrência em duas conexões:**
   - mesmo e-mail de aluno duas vezes: 1 STUDENT criado e 1 `EMAIL_ALREADY_REGISTERED`;
   - dois ADMIN simultâneos: 1 ADMIN criado e 1 `ADMIN_COUNT_CHANGED_REVIEW_REQUIRED`.

   Essas execuções criam **o ADMIN fictício e o STUDENT fictício**. Depois, o e-mail do aluno em MAIÚSCULAS é recusado.
4. **Login real pelo Better Auth**, com a configuração da aplicação:
   - o cadastro público tem de responder `EMAIL_PASSWORD_SIGN_UP_DISABLED`; senha errada dá `INVALID_EMAIL_OR_PASSWORD`;
   - com o **cookie de sessão real**, passa pelos guards de verdade (`createAuthorization`, `createPageAccess`, `handleAccountSession`);
   - **ADMIN:** vai para `/admin/dashboard`; páginas admin permitidas; operações de materiais passam do guard (os dados de materiais nunca são tocados);
   - **STUDENT:** vai para `/aluno/dashboard`; `/admin` leva a `/login?reason=access-denied`; páginas de assinante levam a `/aluno/dashboard?access=subscription-required`; operações admin dão `FORBIDDEN`; a biblioteca dá `SUBSCRIPTION_REQUIRED`.
5. **Estado final.** Usuários, credenciais e sessões preexistentes, `plans`, `subscriptions` e `payments` idênticos; `users` e `auth_accounts` com +2; ADMIN com +1; aluno sem assinatura; exatamente 2 contas de ensaio.

**Relatório:** `resultados/ensaio-contas-neon-<data>.json`, só com códigos, contagens e booleanos, e `pass: true|false`.

**Passos do operador:**
1. No console Neon: **Branches → Create branch**, origem `production`, nome `ensaio-contas-<AAAAMMDD>`. Anotar o endpoint id da nova branch e o da `production`. Copiar a conexão **direta** da branch de ensaio.
2. No terminal local: `node scripts/neon-account-rehearsal.cjs`. Responder nome da branch, endpoint de production, conexão (oculta), banco e endpoint; revisar as evidências; digitar `ENSAIO`. Leva cerca de 1–2 minutos, por causa do caso de transação expirada.
3. Entregar o relatório JSON para análise. Depois, **apagar a branch de ensaio** no console.

## 14. Gerenciamento de usuários no painel (preparado em 2026-11-19; **aplicado só no PostgreSQL local de testes**)

### Histórico de execução do 06

Os arquivos 06/07/92 continuam reutilizáveis: o texto deles não registra execuções, e a pré-condição do 06 recusa reaplicar no mesmo banco. O histórico fica aqui.

| Banco | 06 | 07 | Observação |
|---|---|---|---|
| PostgreSQL local de testes (`compartilhar_auth_test@127.0.0.1`) | ✅ aplicado em 2026-11-20 | ✅ aprovado em 2026-11-20 | Backup pós-06 em `Compartilhar_Clube_Backups/` (fora do repositório) |
| Branch Neon de ensaio | ❌ não aplicado | — | Exige autorização própria |
| Produção (Neon) | ❌ não aplicado | — | Exige autorização própria |

Cadastro de alunos e administradores em `/admin/usuarios`, administradores principais e troca obrigatória da senha inicial. Decisões aprovadas em 2026-11-19: campo `isPrincipalAdmin` (sem `SUPER_ADMIN`); exatamente as duas contas designadas pelo operador; aviso de pagamento anterior sem vínculo automático; gestão de papéis limitada a promover/rebaixar ADMIN comum; troca obrigatória para toda conta criada pelo painel.

### Regras

| Ação | Aluno | ADMIN comum | ADMIN principal |
|---|---|---|---|
| Criar aluno (`POST /api/admin/users`) | 403 | ✅ | ✅ |
| Criar ADMIN comum | 403 | 403 `PRINCIPAL_ADMIN_REQUIRED` | ✅ |
| Promover aluno / rebaixar ADMIN comum (`PATCH /api/admin/users/[id]/role`) | 403 | 403 `PRINCIPAL_ADMIN_REQUIRED` | ✅ |
| Alterar principal ou a si mesmo | 403 | 403 | 403 `PROTECTED_ACCOUNT` |
| Designar principal | — | — | **só operador** (`scripts/principal-admin-operator.cjs designate`) |

- O papel pedido pelo navegador é só um pedido. A rota chama o guard, o service chama de novo e, dentro da transação (após a trava consultiva compartilhada com os scripts de provisionamento), relê o administrador no banco.
- Credenciais só pelo Better Auth (`signUpEmail`, scrypt) numa instância de servidor com `serverProvisioning`: cadastro habilitado só nela, **sem login automático e sem plugin de cookies** — a sessão do administrador nunca é trocada. O cadastro público continua fechado. Como o Better Auth responde a e-mail duplicado com um usuário sintético quando `autoSignIn` está desligado (contrato fixado em `tests/account-password.test.cjs`), o service confere a duplicidade antes (sem diferenciar maiúsculas) e exige a linha real depois.
- Sem assinatura, plano ou pagamento. Se houver pagamento **aprovado** com o mesmo e-mail, o painel mostra só a contagem, avisando que isso não comprova titularidade.
- Auditoria em `admin_audit_events` (somente inclusão), na mesma transação: `USER_CREATED`/`ROLE_CHANGED` com o administrador responsável; `PRINCIPAL_DESIGNATED`/`OPERATOR_PASSWORD_RESET` sem ator de painel. Sem e-mail, senha ou hash.
- Troca obrigatória: `mustChangePassword` bloqueia todas as páginas e APIs protegidas (403 `PASSWORD_CHANGE_REQUIRED`, páginas redirecionam para `/conta/alterar-senha`). Login, logout, `/api/account/session` e a própria troca (`POST /api/account/password` → `changePassword` do Better Auth com a senha atual e `revokeOtherSessions`) continuam funcionando.
- Proteção no banco (06): principal é sempre ADMIN (CHECK); o gatilho recusa criar, conceder, retirar, rebaixar, desativar ou mudar e-mail de principal fora do procedimento de operador, e limita a 2 principais.

### Ordem obrigatória (cada passo exige autorização própria)

1. **Banco local de teste:** aplicar o 06 e rodar o 07 — ✅ concluído em 2026-11-20. (Num banco local sem o 06, o `pnpm dev` reiniciado e os testes com banco local falham, porque o código lê colunas novas.)
2. Designar localmente os principais de teste (`node scripts/principal-admin-operator.cjs designate --local`) e homologar no app local (roteiro abaixo).
3. **Branch Neon de ensaio:** 06 → 07 → designação → homologação no Preview apontado para a branch.
4. **Produção:** backup (branch `backup-pre-usuarios-<AAAAMMDD-HHMM>`) → 06 → 07 → **só então** publicar o código → designar as duas contas principais (`designate`, uma por vez) → 07.
   - Publicar o código antes do 06 quebraria todo login. O código atual funciona com o 06 aplicado (colunas com default).

### Recuperação administrativa (sem sessão ativa)

`node scripts/principal-admin-operator.cjs recover-password [--local]`: o operador informa o e-mail de um ADMIN e uma senha temporária (entrada oculta). O script grava o hash pelo Better Auth, liga `mustChangePassword`, encerra todas as sessões da conta, prova o login e registra `OPERATOR_PASSWORD_RESET`. Não depende de nenhum administrador logado. Redefinir senha de terceiros pelo painel continua fora do escopo.

### Roteiro de homologação

- ADMIN comum: cria aluno; não vê o seletor de tipo de conta; tentativa direta de criar ADMIN → 403; não vê controles de papel.
- Principal: cria ADMIN comum e aluno; promove aluno; rebaixa ADMIN comum; não há controle no próprio cartão nem em principais.
- Conta criada: login vai para `/conta/alterar-senha`; qualquer outra página redireciona para lá; logout funciona; após a troca, as outras sessões caem e o destino é o painel correto.
- Aluno criado: sem assinatura (áreas de assinante bloqueadas), `GET /api/admin/users` e `POST` → 403/405.
- O administrador continua logado após cada cadastro; sessões de outras contas preservadas.
- 07 sem pendências; auditoria com o ator correto.

### Reversão

`92-admin-users-reversao.sql` só antes de qualquer uso (aborta se houver auditoria, principal ou troca pendente) e depois de voltar a aplicação à versão anterior. Depois de qualquer uso: backup/PITR numa branch nova.

**Ordem de reversão: 93 antes de 92.** O 08 depende do 06; por isso o 92 aborta (`GUARD: objetos do 08 presentes — reverter o 93 antes do 92`) enquanto existir `manual_access_grants`, `manual_access_events` ou o tipo `"ManualAccessAction"`, antes de qualquer trava ou `DROP`.

## 15. Liberação manual de acesso (preparado em 2026-11-22; **aplicado só no PostgreSQL local de testes**)

### Histórico de execução do 08

Os arquivos 08/09/93 continuam reutilizáveis: o texto deles não registra execuções, e a pré-condição do 08 recusa reaplicar no mesmo banco. O histórico fica aqui.

| Banco | 08 | Observação |
|---|---|---|
| PostgreSQL local de testes (`compartilhar_auth_test@127.0.0.1`) | ✅ aplicado em 2026-11-22 | Backup pré-08 (`backup-pre-08-2026-11-22T03-20`) em `Compartilhar_Clube_Backups/`, fora do repositório. Recibo do 09 não arquivado em `resultados/` |
| Branch Neon de ensaio | ❌ não aplicado | Exige autorização própria; o 06 precisa vir antes |
| Produção (Neon) | ❌ não aplicado | Exige autorização própria; o 06 precisa vir antes |

Administradores (comuns ou principais) liberam, renovam e revogam acesso aos conteúdos exclusivos para **alunos**, por período determinado, sem criar plano, assinatura ou pagamento. Decisões aprovadas em 2026-11-22: entidades próprias `ManualAccessGrant`/`ManualAccessEvent` (arquitetura B), qualquer ADMIN autorizado, no máximo 366 dias por concessão ou renovação, concessão permitida para quem já tem assinatura paga (com aviso), métrica separada no dashboard administrativo.

### Regra de acesso

`requireActiveSubscription()` (`lib/auth/authorization-core.ts`) mantém o nome e o código `SUBSCRIPTION_REQUIRED`, mas passa a significar **assinatura paga vigente OU concessão manual válida**:
1. `requireSession()` primeiro: conta desativada e troca obrigatória de senha continuam bloqueando, com ou sem concessão.
2. Assinatura paga (`status = "active"`, `startDate <= agora < endDate`). Se existir, a concessão nem é consultada.
3. Só sem assinatura: concessão com `revokedAt IS NULL` e `startsAt <= agora < endsAt`. O vencimento é automático (comparação de datas a cada verificação; não há job).

Uma fonte nunca altera a outra: revogar a concessão não toca a assinatura; o webhook e as tabelas financeiras não foram alterados.

### Regras do painel

| Ação (`POST /api/admin/users/[id]/access`) | Quando | Resultado |
|---|---|---|
| `grant` `{startDate, endDate, expectedUpdatedAt}` | aluno habilitado sem concessão vigente/agendada | cria a linha (ou reutiliza a expirada/revogada) + evento `GRANTED` |
| `renew` `{endDate, expectedUpdatedAt}` | concessão vigente ou agendada | novo último dia, posterior ao atual + evento `RENEWED` |
| `revoke` `{expectedUpdatedAt}` | concessão vigente ou agendada (mesmo de conta desativada) | `revokedAt`/`revokedById` + evento `REVOKED`; efeito na próxima requisição |

- Datas são dias de calendário de Fortaleza: o acesso vale de 00:00 do primeiro dia até o fim do último (`endsAt` exclusivo). Concessão: início a partir de hoje, até 366 dias (inclusivo). Renovação: no máximo 366 dias de validade a partir de hoje (ou do início agendado).
- Cadastro de aluno (`POST /api/admin/users`) aceita `access: {startDate, endDate}` opcional: usuário, `USER_CREATED`, concessão e `GRANTED` na mesma transação. Recusado para ADMIN (400 `INVALID_ACCESS`).
- Concorrência: trava consultiva própria (61420323), `updatedAt` esperado (`updateMany` condicionado) e índice único por aluno; conflito → 409 `ACCESS_CONFLICT`.
- Erros: 400 `INVALID_ACCESS`/`INVALID_ACCESS_PERIOD`, 403 `PROTECTED_ACCOUNT` (a própria conta), 404 `USER_NOT_FOUND`, 409 `ACCESS_ALREADY_ACTIVE`/`ACCESS_NOT_ACTIVE`/`ACCESS_CONFLICT`, 422 `ACCESS_TARGET_NOT_STUDENT`/`USER_DISABLED`.
- Proteção no banco (08): a concessão que pode dar acesso só aponta para ALUNO habilitado e é gravada por ADMIN (gatilho); a revogação é gravada por ADMIN; concessões não são apagadas e a auditoria é somente inclusão.
- Painel: `/admin/usuarios` mostra "Assinatura paga" e "Acesso manual" separados para cada aluno; `/admin/dashboard` ganhou "Acessos manuais ativos" (concessões vigentes de alunos habilitados); o dashboard do aluno mostra o cartão "Acesso liberado pela equipe" só se houver concessão.

### Ordem obrigatória (cada passo exige autorização própria)

1. **Banco local de teste:** aplicar o 08 e rodar o 09 — 08 ✅ aplicado em 2026-11-22. (Num banco sem o 08, o `pnpm dev` reiniciado com este código responde 503 nas áreas exclusivas para alunos **sem** assinatura paga, e os cenários de `lessons`/`student-dashboard`/`private-access`/`real-login` com banco local que chegam à verificação de acesso falham por tabela inexistente.)
2. Homologar no app local (roteiro abaixo).
3. **Branch Neon de ensaio:** 06 (se ainda não aplicado) → 08 → 09 → homologação no Preview. `scripts/neon-account-rehearsal.cjs` usa o guard real: rodá-lo só com o 08 aplicado na branch.
4. **Produção:** backup → 06 (se ainda não aplicado) → 08 → 09 → **só então** publicar o código → homologar.
   - Publicar o código antes do 08 faz alunos sem assinatura paga receberem 503 (os pagantes não são afetados, porque a assinatura é lida primeiro).

### Roteiro de homologação local

- ADMIN comum e principal: liberar acesso a um aluno sem assinatura → aluno acessa aulas, biblioteca e supervisões; renovar; revogar → próxima requisição volta para `/aluno/dashboard?access=subscription-required`.
- Cadastro de aluno com "Liberar acesso aos conteúdos": conta criada com troca de senha pendente; após a troca, conteúdos liberados até o último dia escolhido.
- Aluno com assinatura paga vigente: o painel mostra o aviso; liberar e revogar não alteram a assinatura nem o acesso pago.
- Recusas: liberar para ADMIN ou para aluno desativado; datas no passado ou acima de 366 dias; duas abas liberando ao mesmo tempo (uma recebe conflito).
- Vencimento: com uma concessão cujo último dia é hoje, o acesso cai após a meia-noite de Fortaleza sem nenhuma ação.
- 09 sem pendências; `/admin/dashboard` com "Acessos manuais ativos" coerente com a lista.

### Reversão

`93-manual-access-reversao.sql` só antes de qualquer uso (aborta se houver concessão ou evento) e depois de voltar a aplicação à versão anterior. Depois de qualquer uso: backup/PITR numa branch nova.

**Ordem de reversão: 93 antes de 92.** Para desfazer os dois blocos, rodar o 93 e só depois o 92; o 92 recusa enquanto os objetos do 08 existirem.
