# Gerenciamento real de aulas — validação local

## Auditoria e implementação

Não existia modelo persistente de aulas. As páginas administrativas e do aluno usavam, respectivamente, duas e cinco aulas demonstrativas, sem reprodução real. Essas listas foram substituídas por consultas Prisma. Nenhuma aula foi semeada para preencher a interface.

O modelo independente `Lesson` contém ID, título, descrição, URL normalizada do vídeo, duração em minutos, posição, status (`DRAFT`, `PUBLISHED`, `ARCHIVED`) e datas de criação/atualização. Não modifica relacionamentos existentes. O arquivamento com confirmação substitui a exclusão permanente e permite republicação.

Arquivos desta implementação:

- `prisma/schema.prisma`, `prisma/local/lessons.sql`, `scripts/local-lessons-schema.cjs`: modelo, SQL aditivo e aplicação exclusivamente local.
- `lib/lessons/{validation,service-core,server,http}.ts`: validação, consultas, autorização e respostas HTTP.
- `app/api/admin/lessons/route.ts`, `app/api/admin/lessons/[id]/route.ts`: GET, POST e PATCH administrativos.
- `components/lessons/LessonManager.tsx`, `LessonsError.tsx`: formulário, ações, confirmação, erros e estados vazios.
- `app/admin/aulas/{page,loading,error}.tsx`: gerenciamento real.
- `app/aluno/aulas/{page,loading,error}.tsx`, `app/aluno/aulas/[id]/page.tsx`: catálogo publicado e reprodução autorizada.
- `app/aluno/dashboard/page.tsx`: texto do cartão de aulas atualizado para a funcionalidade disponível.
- `tests/lessons.test.cjs`, `tests/private-access.test.cjs`, `tests/auth-server.test.cjs`, `scripts/local-auth-regression.cjs`: testes e compatibilidade da regressão com registros locais existentes.

## Segurança

Toda operação administrativa exige ADMIN consultado no servidor. O catálogo e a página de reprodução exigem sessão válida, usuário habilitado e assinatura vigente; não usam permissões enviadas pelo cliente. Somente aulas publicadas aparecem para o aluno, na ordem administrativa. O catálogo não inclui a URL do vídeo: ela é obtida na página de reprodução após autorização. As mutações validam origem, JSON, tamanho e campos permitidos. Respostas da API são privadas e não armazenáveis em cache; falhas internas não expõem detalhes.

Ordenação e mutações usam transação e bloqueio para evitar disputas entre administradores. Nenhum endpoint de exclusão permanente foi criado. Biblioteca comercial, checkout, Mercado Pago, webhook, Hotmart e carrossel foram preservados.

## Banco e inicialização

O script lê somente `.env.auth-test.local` e exige o banco `compartilhar_auth_test`, usuário `compartilhar_auth_test_user`, endereço `127.0.0.1:5432`. Confere também a identidade do PostgreSQL conectado. Não use `prisma db push`, `migrate deploy` ou `next dev` diretamente neste procedimento.

A tabela `lessons`, enum e índice foram aplicados localmente. Nenhuma migration foi aplicada em produção. A geração completa do Prisma Client encontrou bloqueio da DLL pelo Windows enquanto havia servidor Next.js em execução. Após encerrar os terminais Next.js com Ctrl+C, execute na raiz:

```powershell
node scripts/local-lessons-schema.cjs
pnpm dev
```

O primeiro comando é idempotente para a tabela já criada e deve terminar com `PASS Prisma validate` e `PASS Prisma generate`. Se aparecer `STOP_NEXT_BEFORE_PRISMA_GENERATE`, encerre os demais processos de desenvolvimento deste projeto antes de repetir. `pnpm dev` usa o inicializador local isolado; reiniciá-lo também atualiza a cópia da aplicação utilizada pelo servidor.

## Primeira aula e validação manual

1. Entre como ADMIN em `http://127.0.0.1:3000/login` e abra `/admin/aulas`.
2. Clique em adicionar aula, informe título, descrição, duração e um link real HTTPS do YouTube ou Vimeo com incorporação permitida. Salve o rascunho.
3. Edite se necessário e publique. Use as setas para mudar a ordem.
4. Em outro perfil de navegador, entre com o STUDENT local que já possui assinatura vigente. Abra `/aluno/aulas`, selecione a aula e confira reprodução, áudio e tela cheia.
5. Despublique e verifique que a aula deixa de aparecer e que seu endereço direto não entrega o vídeo. Republicação e arquivamento devem refletir no catálogo após atualização.
6. Confira que o STUDENT não acessa `/admin` e que visitantes/alunos sem assinatura não acessam o catálogo nem a reprodução.

Não é necessário recriar contas ou modificar assinaturas. A reprodução de um vídeo real e a revisão visual em mobile/desktop permanecem para validação manual: nenhum vídeo do usuário foi fornecido para esse teste.

## Verificações executadas

- 6 testes de aulas: campos/provedores, autorização antes da consulta, origem/JSON/limites, CRUD/transações/publicação/ordenação/arquivamento, permissões com banco local e guardas de páginas.
- 41 testes de regressão de autenticação, login e acesso privado passaram. Comparação integral dos registros antes/depois confirmou preservação dos dados existentes, incluindo planos, assinaturas, pagamentos e aulas.
- 25 testes de preparação/segurança local e carrossel; 58 testes unitários de webhook; 4 testes selecionados do dashboard passaram.
- TypeScript verificado com `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- Next.js real isolado em porta de teste: login ADMIN, página administrativa, criação, edição, publicação/despublicação, arquivamento, ordenação e recusa de origem inválida verificados. Anônimo recebe 401 na API administrativa; STUDENT recebe 403.
- No servidor real, STUDENT sem assinatura foi redirecionado tanto no catálogo quanto no endereço de reprodução. O Next.js pode enviar HTTP 200 com redirecionamento no fluxo HTML; o destino foi verificado, sem entrega de URL de vídeo.
- Fixtures temporárias foram removidas ou revertidas em transação; nenhum vídeo fictício permaneceu no banco. O acesso positivo de assinante foi coberto pelas verificações de autorização e serviço, mas a reprodução completa no navegador deve ser validada com a conta e o vídeo reais.

Comandos reproduzíveis:

```powershell
node --test tests/lessons.test.cjs
node scripts/local-auth-regression.cjs
node --test tests/local-auth-admin.test.cjs tests/auth-test-safety.test.cjs tests/auth-preparation.test.cjs tests/materials-carousel.test.cjs
node scripts/test-webhook.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

## Hospedagem: decisão ainda aberta

A integração atual incorpora vídeos externos, sem uploads, contratação ou mudança da infraestrutura comercial. YouTube permite reprodução incorporada com os [parâmetros oficiais do player](https://developers.google.com/youtube/player_parameters). Vimeo possui [opções de privacidade](https://help.vimeo.com/hc/en-us/articles/12426199699985-About-video-privacy-settings) e [restrição de incorporação por domínio](https://help.vimeo.com/hc/en-us/articles/30030693052305-How-do-I-set-up-domain-level-privacy/), sujeitas às condições do serviço.

A autorização da aplicação protege o catálogo e a entrega inicial do endereço; não impede que um aluno autorizado compartilhe um link externo. Se o requisito for controlar também o acesso no provedor, decidir posteriormente entre restrição por domínio e uma integração de streaming com URLs assinadas. Isso exige avaliação própria, sem contratação automática. A implementação atual aceita apenas YouTube/Vimeo, não HTML de iframe, URLs arbitrárias ou arquivos enviados.

Próximas etapas dependem de aprovação: escolha definitiva de hospedagem, migração de produção planejada separadamente, eventual progresso por aluno e recursos exclusivos relacionados. Não foram implementados novos pagamentos, alterações de planos ou CRUDs de materiais.
