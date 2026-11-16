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
| `scripts/migration-rehearsal-local.cjs` | Ensaio local, sempre ROLLBACK | Banco local de testes |
| `scripts/neon-branch-smoke.cjs` | Prisma + Better Auth na branch, sempre ROLLBACK | Branch de ensaio (recusa `production`/`main`) |
| `scripts/provision-production-admin.cjs` | Primeiro ADMIN | Executado só na branch de ensaio; **não executado na produção** |

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
