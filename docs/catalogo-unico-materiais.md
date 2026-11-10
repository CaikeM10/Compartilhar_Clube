# Catálogo único de materiais — entrega sem migração

> **Atualização (2026-11-10).** Parte deste documento descreve o estado anterior à aplicação local. Desde então os modelos `Material`/`MaterialAsset` estão em `prisma/schema.prisma` e foram aplicados somente no PostgreSQL local de teste (ver `docs/catalogo/local-persistence.json`). `lib/materials/server.ts` agora usa o pool compartilhado (`getAuthInfrastructure().db`), sem nomes de banco fixos, e só opera com `MATERIALS_PERSISTENCE=enabled`, definido exclusivamente pelo launcher local isolado (`scripts/local-auth-admin.cjs`). Em qualquer outro ambiente o serviço falha fechado com 503 `MATERIALS_PERSISTENCE_DISABLED`, antes de qualquer consulta. Nenhuma página consome o serviço ainda.

## Resultado e limite desta etapa

Vitrine, biblioteca do aluno, consulta administrativa e carrossel agora usam `lib/materials/catalog.json` como fonte comercial única. Os 15 produtos foram extraídos programaticamente do array original de `app/materiais/page.tsx` usando a AST do TypeScript, sem redigitar nomes, preços, imagens ou links. `docs/catalogo/baseline.json` é uma referência imutável de auditoria/teste, não uma segunda fonte da aplicação.

**O gerenciamento persistente ainda não está habilitado.** A criação das tabelas e a importação dependem de aprovação explícita. Não há chamadas às tabelas propostas, endpoints administrativos de materiais, upload, download ou credenciais R2. O admin mostra os produtos reais em modo de consulta, sem controles que simulem salvamento.

## Auditoria, instruções e isolamento

- Não foi encontrado AGENTS.md na árvore pesquisada; README, schema, guardas, serviços, testes e auditorias anteriores foram consultados. O README contém descrições antigas de protótipo; os contratos atuais de autorização prevalecem.
- `git status` retornou “not a git repository”. Não existe histórico Git disponível neste diretório. A referência desta entrega registra hashes dos arquivos de autenticação, pagamentos, APIs, aulas, layouts e schema antes das alterações, para preservar o trabalho anterior.
- O isolamento existente usa `scripts/auth-test-safety.cjs`: lê somente `.env.auth-test.local`, aceita exclusivamente `127.0.0.1:5432/compartilhar_auth_test` com o usuário local autorizado e confirma a identidade do servidor. O inicializador local evita herdar a configuração remota.
- Nesta entrega não houve conexão ao PostgreSQL, leitura de credenciais, acesso ao Neon ou operação em conta Cloudflare. As verificações Prisma usam schemas em diretório temporário, ambiente controlado e URL local inerte; os comandos são somente `validate` e `migrate diff` entre datamodels, sem execução de SQL.

### Reconciliação preservada

| Achado | Resultado |
| --- | --- |
| 15 produtos comerciais, sete selos Premium | Valores, propriedades opcionais e ordem preservados exatamente |
| Termômetro com `checkoutUrl` vazio | String vazia mantida; nenhum destino inventado |
| História na Caixa e Intrusos compartilham link Hotmart | Ambos mantidos; link não é chave única |
| História na Caixa contém dois espaços após o hífen | Título preservado byte a byte na extração |
| Jogo da Memória das Emoções na lista antiga | Não foi associado ao jogo com Alfabeto; a antiga lista não é mais fonte operacional, mas permanece na referência de auditoria |
| Biblioteca antiga com 13 URLs de PDFs ausentes | URLs removidas da interface; nenhum PDF ou asset criado |
| Capa antiga do jogo das Emoções ausente | Biblioteca passa a exibir a capa real do produto comercial com Alfabeto, sem afirmar equivalência entre produtos ou arquivos |
| Nomes e ordem próprios do carrossel | Seleção por IDs em `carousel.json`; três títulos alternativos existentes preservados, sem duplicar preços/links/capas |
| Dois exemplos administrativos | Removidos da apresentação, não importados e nunca usados como produtos reais |

As 15 imagens originais e as 30 versões responsivas do carrossel existem. Não foram modificadas. A vitrine continua com a mesma copy, JSX e `MaterialCard`; inclusive o comportamento preexistente do link vazio permanece até aprovação comercial. Links Hotmart não foram acessados ou alterados.

## Etapa A — modelo proposto e SQL

O schema efetivo `prisma/schema.prisma` está intacto. O fragmento proposto está em `prisma/proposals/materials.prisma`; o SQL correspondente, em `prisma/proposals/materials.sql`. Não são migrations executadas nem colocadas em diretório de aplicação automática.

### Material

`id`, `title`, `description?`, `priceCents`, `currency`, `coverImage`, `checkoutUrl?`, `isPremium`, `displayOrder`, `status`, `createdAt`, `updatedAt`.

- IDs dos 15 itens atribuídos uma vez: `material-initial-001` a `material-initial-015`. São identificadores fixos, não devem ser recalculados quando a ordem mudar. Novos materiais usarão CUID.
- Sem unicidade por título ou link comercial. Descrição ausente permanece nula.
- Preço inteiro em centavos, moeda BRL; conversão conferida contra a string comercial original.
- Status DRAFT/PUBLISHED/ARCHIVED. Novos itens começam em DRAFT; os 15 produtos já visíveis são planejados como PUBLISHED.
- Ausência de PDF não impede publicação comercial nem elimina o direito do assinante; impede somente disponibilizar download.
- `isPremium` é exclusivamente visual. Não existe separação de catálogos nem bloqueio de assinante por esse campo.

### MaterialAsset

`id`, `materialId`, `storageKey`, `originalFilename`, `mimeType`, `fileSize`, `checksum?`, `version`, `status`, `createdAt`, `updatedAt`.

Necessário para separar o produto do arquivo privado e manter versões. Estados PENDING/VALIDATED/REJECTED/ARCHIVED. Nenhum asset inicial será importado. A relação impede exclusão de produto com arquivo associado; o CRUD futuro usa arquivamento.

O SQL cria somente dois enums, duas tabelas, índices, uma FK e restrições sobre as tabelas novas. Não contém importação, UPDATE de dados existentes, DELETE ou DROP. É transacional e falha em caso de objetos já existentes, evitando mascarar divergências de schema.

Restrições adicionais: preço/ordem não negativos, moeda BRL, tamanho/versão positivos, MIME PDF, checksum SHA-256 obrigatório para VALIDATED e no máximo um asset VALIDATED por material. Checks e índice parcial são explicitados no SQL porque não são representados integralmente pelo Prisma 5. A validação real do conteúdo continuará sendo responsabilidade do serviço; MIME/checksum declarados não provam que um arquivo é seguro.

`MaterialPresentation` não é necessário nesta fase: o catálogo usa uma ordem canônica, e o carrossel mantém apenas dez referências e três títulos de apresentação em configuração. Se futuramente a curadoria do carrossel se tornar editável no admin, avaliar entidade própria. Uma troca de capa deverá preservar ou regenerar as variantes responsivas antes de alterar o carrossel, sem construir URLs para arquivos inexistentes.

### Importação idempotente preparada, não executada

`scripts/material-catalog-import-plan.cjs` produz somente um plano em memória. Não importa Prisma, não lê ambiente, não se conecta ao banco e não possui opção de gravação.

1. Extrai os campos do catálogo compartilhado, converte preços exatamente e atribui ordem baseada em zero.
2. Compara pelos IDs fixos com os registros existentes fornecidos ao planejador.
3. Planeja criação apenas dos IDs ausentes. Reexecução com os mesmos registros gera zero criações.
4. Preserva registros existentes mesmo quando foram editados e reporta conflitos, sem sobrescrever.
5. Não cria descrições, assets, pagamentos, usuários ou assinaturas.

Após aprovação, o executor local deverá: validar alvo e identidade do PostgreSQL; confirmar o schema; carregar registros; apresentar conflitos para revisão; executar apenas inserções faltantes em transação, com unicidade por ID e tratamento de concorrência; verificar os 15 registros e conferir a preservação dos demais. Registros possivelmente equivalentes com IDs diferentes exigem mapeamento humano — título/link não autorizam fusão. O executor persistente não foi criado nesta etapa.

## Etapa B — gerenciamento administrativo planejado

Hoje `/admin/recursos` continua protegida por `requirePageAccess("admin")`, lista os mesmos 15 produtos e informa preço, capa, ordem, selo e indisponibilidade do PDF. Sidebar e layouts foram preservados. O estado de consulta substitui botões demonstrativos que não salvavam dados.

Após migração/importação aprovadas, implementar:

| Endpoint proposto | Contrato |
| --- | --- |
| GET `/api/admin/materials` | `requireAdmin`; listar registros e resumo de situação do asset, sem URL privada |
| POST `/api/admin/materials` | `requireAdmin` antes de qualquer operação; validar origem/JSON/campos; criar rascunho; 201 |
| PATCH `/api/admin/materials/[id]` | Ações explícitas `edit`, `move`, `status`; revalidar ADMIN e payload; atualizar somente campos permitidos |
| DELETE | Não implementar como operação padrão |

HTTP: 401 sem sessão, 403 sem ADMIN/origem inválida, 400 payload inválido, 404 registro ausente, 409 conflito de versão/edição, 413 tamanho excedido, 415 tipo inválido, 503 indisponibilidade. Respostas privadas/no-store, erros sanitizados. STUDENT não acessará operações administrativas mesmo por chamada direta.

Validar título não vazio com limite, descrição opcional com limite, centavos inteiros não negativos, moeda BRL, URL Hotmart HTTPS ou vazia, capa com origem/caminho permitido e somente campos conhecidos. A validação não deve normalizar silenciosamente títulos/links dos 15 itens importados. Edição comercial é ação explícita do ADMIN; não inferir preços ou corrigir links.

Ordenação em transação com desempate estável por ID, controle de concorrência e preservação dos demais registros. Arquivamento exige confirmação e permite recuperação. Publicação não exige PDF: sem arquivo, a biblioteca apresenta indisponibilidade. Antes de substituir as leituras, confirmar importação completa para não publicar uma vitrine vazia.

Manter cards, tipografia, sidebar azul-escuro e botões dourados no futuro formulário; reutilizar padrões de diálogo/erros do gerenciador de aulas, sem alterar seu CRUD.

## Etapa C — integração atual e futura

| Página | Implementado sem banco | Após aprovação |
| --- | --- | --- |
| `/materiais` | Importa os mesmos dados do arquivo único; JSX/copy/checkout intactos | Server reader de materiais publicados, adaptando centavos para o mesmo formato visual |
| Carrossel | Mesmo conjunto, títulos alternativos, ordem, imagens e animações; referências por ID | Resolver referências no catálogo publicado, com comportamento definido para arquivados e capas substituídas |
| `/admin/recursos` | Catálogo real em modo de consulta; nenhum botão de gravação fictício | CRUD autorizado e persistente |
| `/aluno/recursos` | Mesmos 15 materiais, títulos e ordem canônicos; assinatura exigida; sem compra/preços e sem links quebrados | Consulta publicada e projeção de disponibilidade; descrição somente se existir |

O estado atual não é fallback silencioso para falha de banco: ainda não existe modo persistente. Na futura troca, uma falha de consulta deve exibir indisponibilidade, nunca reintroduzir produtos arquivados a partir do arquivo inicial.

## Etapa D — R2 somente planejado

Não foram solicitadas credenciais nem instalados SDKs. Futuramente: upload ADMIN para bucket privado/quarentena; chave gerada no servidor; limites de tamanho e tipo; inspeção do conteúdo e análise de segurança; checksum calculado/verificado no servidor; associação por material e versão.

Somente depois de validar o objeto, trocar o asset VALIDATED em transação, arquivando a versão anterior sem exclusão física automática. Chaves privadas nunca entram no catálogo JSON público nem em `public`.

Download futuro, em rota separada, exigirá sessão válida, conta habilitada, assinatura vigente, material PUBLISHED e asset VALIDATED pertencente ao mesmo material. Resolver a chave no servidor; não aceitar storageKey/URL fornecida pelo cliente. Sem asset, retornar indisponibilidade. Somente após autorização emitir URL curta ou stream privado/no-store. ADMIN poderá inspecionar arquivos por uma rota administrativa própria, não por bypass da regra do aluno.

Visitantes continuam comprando pela Hotmart. Compra avulsa não cria conta, assinatura ou direito de acesso à plataforma automaticamente; nenhuma integração comercial foi alterada ou proposta como condição desta entrega.

## Validações

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — aprovado.
- Prisma: `node scripts/check-material-schema.cjs` — schema atual e composição com a proposta válidos; diff offline coincide com o SQL base preparado. Checks adicionais revisados estaticamente; SQL não aplicado a PostgreSQL.
- 38 testes seguros aprovados, sem conexão ao banco ou fixtures persistentes:

```powershell
node --test --test-skip-pattern='real authorized|local PostgreSQL|persisted local|private page entry|real Better' tests/material-catalog.test.cjs tests/admin-dashboard.test.cjs tests/student-dashboard.test.cjs tests/lessons.test.cjs tests/private-access.test.cjs tests/real-login.test.cjs tests/materials-carousel.test.cjs tests/auth-test-safety.test.cjs tests/auth-preparation.test.cjs
```

Cobertura nova: valores/propriedades/ordem dos 15 produtos e JSX público exatos; seleção do carrossel; planejamento idempotente sem sobrescrita; 15 cards em aluno/admin; ausência de download, compra e preços na biblioteca; ADMIN/STUDENT e assinatura sem vigência usando a autorização real com dependências em memória; hashes de autenticação/pagamentos/aulas/layout/schema. APIs de mutação e importação persistente ainda não existem, portanto seus testes integrados ficam para a fase aprovada.

- Chromium headless: três páginas com componentes reais e CSS Tailwind em 320, 375, 768, 1024 e 1440 px. Sem overflow horizontal, cards e botões contidos. Renderização estática com guarda substituída para inspeção visual, sem login, hidratação ou banco. Script temporário removido após execução. A animação/gestos do carrossel são cobertos pela regressão específica.
- Revisão com `vercel:react-best-practices`: sem efeitos/consultas novas, estado de consulta explícito, imagens com texto alternativo e download desabilitado; identidade e limites server-side preservados.

## Arquivos desta entrega

Criados:
- `lib/materials/catalog.json`, `lib/materials/catalog.ts`, `lib/materials/carousel.json`.
- `prisma/proposals/materials.prisma`, `prisma/proposals/materials.sql`.
- `scripts/material-catalog-import-plan.cjs`, `scripts/check-material-schema.cjs`.
- `tests/material-catalog.test.cjs`.
- `docs/catalogo/baseline.json`, `docs/catalogo-unico-materiais.md`.

Modificados:
- `app/materiais/page.tsx`.
- `app/admin/recursos/page.tsx`.
- `app/aluno/recursos/page.tsx`.
- `components/materials/MaterialsCarousel.tsx`.
- `components/library/MaterialLibraryCard.tsx`.
- `tests/materials-carousel.test.cjs`, `tests/private-access.test.cjs` (exceções específicas para alterações autorizadas; novos contratos cobrem o catálogo).

## Decisões pendentes e próxima aprovação

Continuam pendentes a confirmação do link repetido, o link do Termômetro e a identidade do jogo das Emoções. Nenhum bloqueia a preservação do catálogo comercial, mas não será corrigido automaticamente. Arquivos privados reais serão necessários antes de qualquer download.

Próxima etapa: aprovar o schema/SQL aditivo e a importação local dos 15 registros reais; então preparar o executor controlado, aplicar somente no banco local autorizado e habilitar o CRUD. Essa aprovação não deve incluir produção, deploy, alteração de pagamentos ou R2. A exigência de parar antes de executar a migração vem expressamente das seções 2 e 10 da tarefa do usuário.
