# Migração do banco de produção (Neon) para Better Auth

Status (2026-11-15): **ensaio na branch Neon `ensaio-better-auth` aprovado** (00 → 01 → 02 → 03 sem erro, impressão digital das tabelas financeiras preservada, smoke `"pass": true`, administrador de ensaio provisionado com `create` e conferido pelo 03). **Nada aplicado na produção.** Próximo passo: login real em Preview da Vercel apontado para a branch de ensaio.
Status anterior (2026-11-11): ensaio local executado e aprovado.
Base: `main` @ `63380a4`, Better Auth 1.7.17, Prisma 5.10.2. Snapshot: `backup-pre-migracao-better-auth-2026-11-11`.

## Arquivos

| Arquivo | Tipo | Uso |
|---|---|---|
| `00-inspecao-somente-leitura.sql` | `BEGIN READ ONLY` … `ROLLBACK` | Produção (autorizado) e branch de ensaio |
| `01-auth-better-auth.sql` | DDL aditivo, 1 transação, pré/pós-condições e impressão digital dos dados | Branch de ensaio; produção só com nova autorização |
| `02-lessons.sql` | Cria `lessons` (tabela nova) | Idem |
| `03-pos-verificacao-somente-leitura.sql` | READ ONLY + ROLLBACK | Após 01/02 e após o admin |
| `90-reversao-emergencia.sql` | Remove só objetos novos; aborta se houver dado gravado | Somente emergência autorizada |
| `resultados/ensaio-local-2026-11-11.json` | Resultado do ensaio local (dados sintéticos) | Registro |
| `scripts/migration-rehearsal-local.cjs` | Ensaio local, sempre ROLLBACK | Banco local de testes |
| `scripts/neon-branch-smoke.cjs` | Prisma + Better Auth na branch, sempre ROLLBACK | Branch de ensaio |
| `scripts/provision-production-admin.cjs` | Primeiro ADMIN | Executado só na branch de ensaio; **não executado na produção** |

## 1. Diagnóstico

O código em produção usa o Prisma Client do schema novo. Consultas a `users` selecionam `role`, `emailVerified`, `image`, `disabledAt` e `updatedAt`, que o banco antigo não tem. O resultado é erro SQL → 500 → `503 AUTH_UNAVAILABLE` (`lib/auth/http.ts`). As tabelas `auth_*` também faltam. O webhook do Mercado Pago (`tx.user.findUnique`) falha pelo mesmo motivo; a migração corrige isso sem tocar no código de pagamentos.

`lessons` **é necessária** (`/admin/dashboard`, `/admin/aulas`, `/aluno/aulas`). `materials` **não é** enquanto `MATERIALS_PERSISTENCE` não estiver definida na Vercel.

## 2. Ensaio local (executado)

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
| **Schema resultante × schema homologado local** (onde Prisma Client e Better Auth passam nos testes de integração) | **102/102 elementos idênticos** (colunas, tipos, nulidade, defaults, índices, constraints de users, auth_*, lessons) |
| Reversão 90 com conta de auth gravada | recusada pela guarda |
| Reversão 90 sem dados | remove só os objetos novos; dados antigos com impressão idêntica; reaplicação de 01/02 OK |
| Persistência | nenhuma (schema temporário inexistente após o ROLLBACK) |

Smoke de compatibilidade (`neon-branch-smoke`) executado contra o banco local (já migrado), também em ROLLBACK: os 8 modelos Prisma foram lidos, o cadastro público foi recusado (`EMAIL_PASSWORD_SIGN_UP_DISABLED`), o ciclo de credencial sintética funcionou (cadastro no servidor, login válido, senha errada → `INVALID_EMAIL_OR_PASSWORD`), usuários existentes foram carregados sem erro e o login de usuário existente retorna `INVALID_EMAIL_OR_PASSWORD` (401, não 503). Nada foi persistido.

**Limite do ensaio local:** ele usa o schema antigo *declarado* (`before.prisma`). O schema *real* da produção só é confirmado pela inspeção 00 e pelo ensaio na branch.

## 3. Bloqueio do cadastro público (implementado no código, não implantado)

- `lib/auth/config.ts`: `emailAndPassword.disableSignUp = environment.allowSignUp !== true`. `readAuthEnvironment()` **nunca** define `allowSignUp`, então a aplicação recusa `POST /api/auth/sign-up/email` com 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`, antes de qualquer acesso ao banco.
- Só código de servidor confiável liga o cadastro, injetando `allowSignUp: true` na própria instância: o script `create` de provisionamento, os scripts locais e os testes de integração.
- O provisionamento `link-existing` não depende de cadastro.
- Efeito em produção só após deploy. Ainda **não existe outro caminho de entrada para alunos novos**; a ativação/redefinição de senha continua pendente.

## 4. Procedimento na branch de ensaio do Neon (para você executar)

Pré-requisito: Neon Console → Branches → **Create branch** a partir de `production`, nome `ensaio-better-auth`. Use a conexão **direta** (sem `-pooler`) dessa branch. Em todos os comandos, o `psql` pede a senha de forma oculta se ela não estiver na URL; não cole a senha na linha de comando.

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
cd docs\producao-migracao
mkdir resultados -Force

# (A) Inspeção da PRODUÇÃO — somente leitura (autorizada)
& $psql "host=<ep-producao>.neon.tech dbname=<banco> user=<usuario> sslmode=require" -v ON_ERROR_STOP=1 -f 00-inspecao-somente-leitura.sql -o resultados\00-producao.txt

# (B) Ensaio na BRANCH
$branch = "host=<ep-ensaio>.neon.tech dbname=<banco> user=<usuario> sslmode=require"
& $psql $branch -v ON_ERROR_STOP=1 -f 00-inspecao-somente-leitura.sql -o resultados\00-ensaio-antes.txt
& $psql $branch -v ON_ERROR_STOP=1 -f 01-auth-better-auth.sql
& $psql $branch -v ON_ERROR_STOP=1 -f 02-lessons.sql
& $psql $branch -v ON_ERROR_STOP=1 -f 03-pos-verificacao-somente-leitura.sql -o resultados\03-ensaio-depois.txt
cd ..\..
node scripts\neon-branch-smoke.cjs
```

`neon-branch-smoke` pede o nome da branch (recusa `production`/`main`), a conexão em entrada oculta e a confirmação do banco e do endpoint. O resultado é gravado em `resultados/smoke-ensaio.json` (não redirecione a saída: o script exige terminal interativo).

Os arquivos de `resultados/` contêm apenas estrutura, contagens e hashes. Não contêm e-mails, senhas ou tokens, exceto se você descomentar as consultas `[PII OPCIONAL]`. Envie-os para análise. Depois, apague a branch de ensaio no Neon Console.

**Critérios de aprovação da branch:**
- 00: nenhum objeto novo, colunas de `users` iguais a `before.prisma`, dono das tabelas = usuário usado.
- 01: `COMMIT` sem erro.
- 03: contagens e seção 7 (impressão digital) **iguais** à seção 18 do `00-ensaio-antes`.
- smoke: `"pass": true`.

## 5. Conflitos com dados existentes

1. **E-mails com maiúsculas ou espaços** (seções 9/9b do 00). O Better Auth procura `lower(email)` com igualdade exata, então essas contas não entram nem redefinem senha. A decisão sobre normalizar fica para depois da inspeção. O provisionamento recusa `create` para e-mail existente em qualquer grafia (não duplica usuário) e recusa `link-existing` se o e-mail gravado não estiver normalizado.
2. **Usuários antigos sem credencial.** O `users.password` antigo nunca é lido nem copiado. O caminho legítimo é a redefinição de senha (o Better Auth cria a credencial ausente), que depende de um provedor de e-mail ainda pendente.
3. **`name` nulo e `updatedAt`** recebem o instante da migração. Validado: o Better Auth carrega esses registros sem erro.
4. **IDs e vínculos preservados.** A migração não altera `users.id`, assinaturas nem pagamentos (impressão digital). O `link-existing` mantém o id e as assinaturas, o que é verificado dentro da transação.

## 6. Primeiro administrador — `scripts/provision-production-admin.cjs` (não executado)

Modos: `create` (e-mail novo) e `link-existing` (usuário antigo; preserva id, assinaturas e pagamentos).

1. Terminal interativo. Conexão, e-mail e senha em **entrada oculta** (nunca em argumento, env, arquivo ou log). Recusa host local, pooler e conexão sem TLS. Exige redigitar o nome do banco e o id do endpoint, e digitar `PROVISIONAR`.
2. Antes de pedir credenciais, confere que o 01 foi aplicado e que não existe ADMIN.
3. Uma transação com `pg_advisory_xact_lock`:
   - recusa se existir ADMIN;
   - `create`: cadastro pelo Better Auth no servidor (`allowSignUp` só nessa instância);
   - `link-existing`: cria uma única credencial `credential`/`accountId = users.id` com o hasher do Better Auth;
   - confere as invariantes;
   - **prova o login** pelo mesmo caminho da produção antes de conceder privilégio;
   - promove a ADMIN, apaga as sessões criadas e confere que existe exatamente 1 ADMIN.

   Qualquer falha reverte tudo.
4. Imprime só o id. Senha do admin: 12 a 128 caracteres.

Ordem prevista: rodar na **branch** primeiro (com autorização), depois `03` (exatamente 1 ADMIN com credencial), depois login real no Preview apontado para a branch. Só então, na produção: primeiro 01/02 (+ 03), depois o provisionamento (+ 03).

## 7. Recuperação

| Situação | Ação |
|---|---|
| Erro em 01/02 | A transação reverte sozinha. Corrigir a causa e repetir |
| Problema no app após migrar | Instant Rollback do deploy na Vercel. O schema é aditivo e compatível com o código antigo |
| Suspeita sobre os dados | Restaurar snapshot/PITR numa branch nova e comparar com a impressão digital do 00 |
| Restauração total | Antes, exportar `payments`/`subscriptions`/`users` posteriores ao snapshot |
| Remover objetos novos | `90-reversao-emergencia.sql` (guardas testadas no ensaio) |

## 8. Pendente de autorização

1. ~~Inspeção (A) na produção~~ e ~~ensaio (B) na branch~~: concluídos.
2. ~~Provisionamento na branch~~: concluído. Homologar login/sessão/logout no Preview da Vercel (branch de ensaio).
3. Aplicar 01/02 na **produção** (pré-requisito do provisionamento: o script recusa schema não migrado) e rodar o 03.
4. Executar o provisionamento do administrador definitivo na produção e rodar o 03 novamente.
5. Deploy do bloqueio de cadastro (junto ou depois da migração).
6. Decisão sobre normalização de e-mails, após o resultado do 00.
