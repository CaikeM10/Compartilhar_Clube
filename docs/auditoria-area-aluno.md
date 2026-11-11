# Auditoria funcional e UX — Compartilhar Clube

Data: 06/11/2026. Escopo: todas as 7 páginas do aluno, as 5 páginas administrativas, layouts, autenticação, serviços simulados e pontos públicos relacionados. Inspeção de código e arquivos; testes locais de autenticação. Não foi realizada sessão de inspeção visual em navegador nesta auditoria. As observações de responsividade são derivadas do markup/CSS e precisam de confirmação manual em dispositivos.

## Resultado principal

A autenticação, identidade exibida, logout e autorização por papel/assinatura são reais. O catálogo, os dashboards, a gestão de usuários e as configurações das telas ainda não são alimentados pelo banco. O administrador não publica conteúdos para o aluno: cada página possui sua própria lista estática.

Hardcoded não significa necessariamente fictício: menus e textos institucionais são configuração editorial; links Google Forms/WhatsApp/Instagram/Hotmart são destinos externos configurados, cuja operação externa não foi validada nem utilizada. Os indicadores de uso e listas de demonstração não possuem fonte de dados verificável na aplicação.

## Matriz por página

Todas as páginas abaixo executam autorização server-side antes de renderizar. `account` exige sessão válida e conta não bloqueada; `subscriber` também exige assinatura `active`, início até agora e fim no futuro; `admin` exige papel ADMIN vindo do banco. ADMIN não ganha assinatura automaticamente.

| Página e arquivo | O que funciona hoje | Demonstrativo / sem persistência | O que falta |
| --- | --- | --- | --- |
| `/aluno/dashboard` — `app/aluno/dashboard/page.tsx` | Guarda `account`, identificação real no layout, links para aulas/recursos/supervisões, logout | 24 aulas, +3/mês, 120+ PDFs, 8 supervisões, 15 PDFs novos, notícia de aula e supervisão em 15/01/2026; recomendação aponta apenas à listagem | Consultas agregadas, novidades publicadas, recomendação com ID; situação/validade da assinatura; tratamento de acesso negado |
| `/aluno/aulas` — `app/aluno/aulas/page.tsx` | Guarda `subscriber`, lista e estados visuais | 5 objetos em `aulas`; durações, `hasAccess` e `locked` fixos; “Assistir aula” sem handler/link/player | Modelo Lesson (Course opcional), catálogo publicado, detalhe/player, autorização por conteúdo; progresso opcional |
| `/aluno/recursos` — `app/aluno/recursos/page.tsx` | Guarda `subscriber`, 12 capas presentes, âncoras de download | 13 objetos em `materials`; nenhum dos 13 PDFs referenciados existe; 1 capa ausente | Resource, metadados reais, armazenamento privado, upload e download autenticado; busca e estados vazios |
| `/aluno/avaliacao` — `app/aluno/avaliacao/page.tsx` | Guarda `account`, link externo em nova aba | Não há formulário interno nem persistência Prisma; promessa de confidencialidade não é demonstrada pelo código | Validar operação/política do formulário externo ou aprovar Feedback persistido; confirmação e histórico se internos |
| `/aluno/sugestoes` — `app/aluno/sugestoes/page.tsx` | Guarda `account`, link externo | Mesmo Google Form da avaliação; lista editorial de sugestões; sem registro de envio no app | Definir separação de finalidade; manter externo ou implementar Feedback com tipo SUGGESTION |
| `/aluno/supervisoes` — `app/aluno/supervisoes/page.tsx` | Guarda `subscriber`, link para solicitação individual | 3 eventos de janeiro/2026; botão “Participar” sem ação; profissão é apenas texto | Supervision/Event, agenda atual, inscrição e regras de elegibilidade; link de reunião protegido |
| `/aluno/solicitar-supervisao` — `app/aluno/solicitar-supervisao/page.tsx` | Guarda `subscriber`, link para outro Google Form | Nenhuma solicitação/status no banco; texto promete análise e contato fora da aplicação | Confirmar fluxo externo ou aprovar SupervisionRequest, acompanhamento e regras de acesso |
| `/admin/dashboard` — `app/admin/dashboard/page.tsx` | Guarda `admin`, identidade real e navegação | 156 membros, 24 aulas, 120 recursos, 89% engajamento; 3 atividades e 2 feedbacks fixos | Agregações reais, definição mensurável de engajamento, eventos/auditoria; integração de feedback |
| `/admin/aulas` — `app/admin/aulas/page.tsx` | Guarda `admin`, exibição | 2 aulas fixas; “Adicionar Aula”, “Editar”, “Excluir” não têm ação; Ativo é badge | CRUD validado, publicação/arquivamento, ordenação; mesmas entidades consumidas pelo aluno |
| `/admin/recursos` — `app/admin/recursos/page.tsx` | Guarda `admin`, exibição | 2 recursos diferentes do catálogo do aluno; arquivos ausentes; adicionar/editar/excluir sem operação | CRUD Resource, upload privado, publicação e download protegido |
| `/admin/usuarios` — `app/admin/usuarios/page.tsx` | Guarda `admin`, layout | 3 pessoas fixas; total derivado desse array; “Ver detalhes” sem ação | Consulta paginada de User, detalhes mínimos, assinaturas; operações sensíveis separadas e auditadas |
| `/admin/configuracoes` — `app/admin/configuracoes/page.tsx` | Guarda `admin`, campos editáveis no navegador | 5 `defaultValue`; formulário sem action/onSubmit, campos sem name; salvar não persiste e pode submeter/recarregar a página | Modelo de configurações permitido, validação, salvamento, feedback e leitura nos consumidores |

## Inventário detalhado dos dados demonstrativos

### Aulas

`app/aluno/aulas/page.tsx`: Introdução ao Compartilhar Clube (15 min), Desenvolvimento Cognitivo na Primeira Infância (45), Estratégias de Alfabetização (60), Neuropsicopedagogia Aplicada (50, bloqueada) e Avaliação Psicopedagógica (55, bloqueada/sem acesso). Não há videoUrl preenchida, rota de detalhe nem player.

`app/admin/aulas/page.tsx`: somente as duas primeiras; IDs `1`/`2`, `courseId: 2026`, ordem e estado ativo estáticos. O administrador e o aluno não compartilham a mesma fonte. `services/api.ts` ainda possui uma terceira lista com apenas Introdução.

Os indicadores dizem 24, mas existem 5 cards de aluno e 2 de administrador. A aula sem acesso é exibida dentro de uma página que já exige assinatura ativa: os flags locais contradizem a autorização real.

### Materiais

| Título no aluno | Caminho do PDF (todos ausentes em public) |
| --- | --- |
| Marmita da Leitura | `/pdfs/marmita-da-leitura.pdf` |
| Caçadores de Palavras | `/pdfs/cacadores-de-palavras.pdf` |
| Arraiá da Alfabetização | `/pdfs/arraia-da-alfabetizacao.pdf` |
| Leitores de Palavras | `/pdfs/leitores-de-palavras.pdf` |
| Mood Kids | `/pdfs/mood-kids.pdf` |
| Termômetro das Emoções | `/pdfs/termometro-das-emocoes.pdf` |
| Não Aceitamos Fiado | `/pdfs/nao-aceitamos-fiado.pdf` |
| Pipoca com Rima | `/pdfs/pipoca-com-rima.pdf` |
| Jogo da Memória das Emoções | `/pdfs/jogo-da-memoria.pdf` |
| Intruso – Letra Inicial | `/pdfs/intruso-letra-inicial.pdf` |
| Aprendendo sobre a Felicidade | `/pdfs/aprendendo-sobre-a-felicidade.pdf` |
| Letras Iguais | `/pdfs/letras-iguais.pdf` |
| Varal Literário | `/pdfs/varal-literario.pdf` |

A capa `/jogodamemoria.webp` também está ausente. Existe uma imagem com outro nome usada na vitrine, mas não se deve assumir que representa o mesmo produto. Nenhum PDF foi encontrado em `public`. O componente `components/library/MaterialLibraryCard.tsx` apenas cria `<a href={fileUrl} download>`.

No administrador: Atividades de Alfabetização — Pacote Completo (50 atividades; `/recursos/alfabetizacao.pdf`; 01/01/2026) e Jogos Pedagógicos para Desenvolvimento Cognitivo (15 jogos; `/recursos/jogos.pdf`; 05/01/2026). Os dois arquivos também estão ausentes. As quantidades, datas e disponibilidade são fixas.

**Não preencher esses caminhos com PDFs privados dentro de `public`: a guarda da página não protege URLs de arquivos públicos.** O substituto correto é metadado persistido + endpoint de download autorizado + armazenamento privado. Não existe vazamento desses PDFs ausentes; existe um risco no desenho atual se forem adicionados como arquivos públicos.

### Pessoas, atividade e feedback

- `app/admin/usuarios/page.tsx`: Maria Silva (`maria.silva@email.com`, student, 15/12/2025), João Santos (`joao.santos@email.com`, student, 20/12/2025), Ana Costa (`ana.costa@email.com`, admin, 10/11/2025). São literais de demonstração, não resultados de consulta. Não usar esses endereços para criar contas/enviar mensagens.
- `app/admin/dashboard/page.tsx`: Maria Silva com avaliação 5/5 e elogio; João Santos com sugestão de neuropsicopedagogia. Não são feedbacks coletados pelo app.
- Atividade recente: “15 novos usuários”, “Nova aula publicada”, “8 recursos baixados” com “há 2 horas/5 horas/1 dia” constantes.
- O nome/e-mail no layout vêm do usuário autenticado. Esses dados são reais e distintos da lista demonstrativa.

### Supervisões, configuração e serviços residuais

- `supervisoes`: Casos Clínicos em 15/01/2026 às 19h (90 min), Alfabetização em 22/01 às 19h (60 min), Casos Exclusivos em 29/01 às 20h (90 min). Todos anteriores à data da auditoria. Zoom é só texto; nenhum link de participação ou inscrição.
- Configurações: nome Compartilhar Clube, descrição institucional, contato@compartilharclube.com.br, telefone `(11) 99999-9999`, Instagram @compartilharclube. São defaults locais; o rodapé utiliza outro e-mail/telefone. Alterar o formulário não altera o rodapé.
- `services/api.ts` declara explicitamente “Mock API service”. Login decide role por substring “admin”; registro fabrica ID; sessão lê marcador localStorage e inventa “Usuário Teste”; aulas/recursos/usuários simulam CRUD com delay e retornos em memória; feedback/contato apenas fazem console.log.
- `hooks/useLessons.ts` e `hooks/useResources.ts` usam esse serviço e mantêm estado React. Não há consumidores desses hooks nas páginas atuais. O login atual usa `contexts/AuthContext.tsx` + Better Auth, **não** o login mock. Não reutilizar esse serviço para futuras features; aposentar somente após a integração aprovada e checagem de dependências.
- `lib/types.ts` contém interfaces Course/Lesson/Resource/Supervision/MaterialIndividual; interfaces TypeScript não são tabelas Prisma.
- Arrays de navegação, benefícios institucionais e tipos de sugestão são conteúdo editorial/configuração, não evidência de dados operacionais fictícios. Não precisam virar tabelas automaticamente.

### Achados adicionais na área pública (somente inspeção)

| Arquivo / tela | Achado |
| --- | --- |
| `app/contato/page.tsx` | Submit faz console.log dos dados e alert de sucesso; não envia/persiste. |
| `app/recuperar-senha/page.tsx` | setTimeout simula sucesso após 1,5s; não envia e-mail nem altera senha. |
| `app/recursos/page.tsx` | Contagens 50+, 30+, 40+ fixas e promessa de PDFs; sem catálogo consultado. |
| `app/materiais/page.tsx` | 15 produtos, preços, capas e URLs fixas; Termômetro tem checkoutUrl vazio; História na Caixa e Intrusos compartilham uma URL. São configurações comerciais a confirmar com o responsável, não produtos necessariamente fictícios. |
| `components/materials/MaterialsCarousel.tsx` | 10 itens fixos com configurações comerciais. Não foi alterado. |
| `app/page.tsx`, `app/clube/page.tsx` | Textos/benefícios e ofertas estáticas. Dados institucionais não foram classificados como fictícios sem evidência. Valores e equivalentes mensais precisam de revisão comercial separada. |
| `app/checkout/CheckoutClient.tsx`, `app/api/create-payment/route.ts` | Integração real com Mercado Pago; mapa de preços hardcoded, valor de desenvolvimento R$1 e base ngrok fixa. Não é simulação segura de compra e não foi executada. |
| `app/checkout/sucesso/page.tsx` | Mensagem de pagamento confirmado sem consultar estado. A liberação efetiva depende do backend; a tela não prova pagamento. |
| `app/checkout/pendente/pendente.tsx` | Mensagem estática; não há page.tsx nessa pasta. Retorno de falha aponta `/checkout/erro`, também sem página encontrada. Apenas registrado; fluxo comercial preservado. |

Nenhum link externo foi acionado, formulário enviado, pagamento criado ou dado comercial alterado nesta auditoria.

## O que já usa Prisma e o que não existe

Modelos existentes: User, Account, Session, Verification, Plan, Subscription e Payment.

| Fluxo | Persistência / controle existente |
| --- | --- |
| Login/cadastro/sessão/logout | `lib/auth/config.ts` usa adaptador Prisma do Better Auth; `server.ts` instancia cliente sem logs; `app/api/auth/[...all]/route.ts` encaminha os handlers. Hash em Account, cookies HttpOnly, origem validada. |
| Sessão do usuário | `app/api/account/session/route.ts` + account-http + authorization; projeção limitada do próprio usuário e destino pelo papel real. |
| Acesso privado | `authorization-core.ts` consulta User atualizado e Subscription com período válido; layouts e 12 páginas chamam as guardas. Conta bloqueada é recusada. |
| Pagamentos | Webhook usa transação Prisma para Payment/Subscription e plano/beneficiário existentes, com idempotência. Código apenas inspecionado; não executado. |
| Helper legado | `lib/auth.ts` consulta User/subscriptions; `checkUserAcess` está importado mas não chamado no dashboard admin. Não é a fonte dos indicadores nem a guarda atual. |
| Conteúdo, usuários listados, settings, eventos, progresso | Sem consultas operacionais nas telas e sem modelos de conteúdo/configuração/progresso. User/Plan/Subscription já existem, mas faltam consultas/telas de gestão. |

Não existem endpoints de aulas, recursos, download privado, usuários administrativos, configurações, progresso, feedback ou supervisões. As únicas famílias de API atuais são auth, account/session, create-payment e webhook.

## Avaliação de UX e prioridades

| Prioridade | Problema observado no código | Efeito / direção proposta (sem alteração agora) |
| --- | --- | --- |
| Alta | Assistir/participar/adicionar/editar/excluir/ver detalhes sem ação; configurações não salvam | A interface promete operações que não conclui. Integrar cada fluxo completo, incluindo carregamento, erro, sucesso e persistência após reload. |
| Alta | PDFs ausentes e uma capa quebrada | O benefício principal de materiais não pode ser testado de ponta a ponta. Substituir referências somente após catálogo e arquivos privados aprovados. |
| Alta | Não há tela/cartão de assinatura ou data de validade | O aluno não sabe o que possui nem por que perdeu acesso. Mostrar plano/status/período reais sem inventar status de pagamento. |
| Alta | `subscription-required` redireciona para dashboard, mas dashboard não lê a query | Cliques podem parecer um retorno sem explicação. Futuramente mostrar estado de assinatura e próximo passo sem trocar checkout nesta etapa. |
| Alta | Avaliação Psicopedagógica mostra “Requer assinatura ativa” a um assinante; bloqueios locais contraditórios | Separar rascunho/agendamento/indisponibilidade de autorização do usuário. |
| Alta | Recuperação de senha simula envio | Pode impedir recuperação real. Tratar como etapa própria, dependente de provedor de e-mail e fluxo aprovado. |
| Média | Dashboard promete aula recomendada mas abre catálogo genérico; números e novidades fixos | Perda de confiança/orientação. Destaque por conteúdo publicado e destino específico. |
| Média | Número solto `9` antes de Acesso Rápido; “Aulas 2026” fixo | Resíduo de edição e calendário rígido; registrar para correção futura, preservando o design agora. |
| Média | Eventos passados apresentados como próximos; `new Date('YYYY-MM-DD')` formatado sem timezone | Datas podem retroceder um dia em fuso UTC−3; armazenar instante/fuso e formatar consistentemente. |
| Média | Restrição “exclusivo para psicólogos” apenas em texto | Não há profissão verificada ou regra por evento. Antes de disponibilizar casos/links restritos, definir e implementar elegibilidade no servidor. |
| Média | Avaliação e sugestões usam o mesmo formulário; URLs de avaliação/solicitação têm espaço final | Confirmar intencionalidade, normalizar destinos numa etapa aprovada e explicar saída da plataforma. Não há confirmação/histórico interno. |
| Média | Listas sempre preenchidas; loading.tsx administrativos retornam null | Não existem estados úteis de catálogo vazio, nenhuma busca encontrada, falha de carga ou salvamento. Adotar estados explícitos ao integrar. |
| Média | Menu mobile sem aria-label/expanded/controls, Escape, foco preso/retornado ou inert | Navegação por teclado/leitor de tela pode alcançar sidebar fechada ou conteúdo de fundo. Conferir em 360/390 px e com teclado. |
| Média | Header mobile z-50 sobre sidebar z-40; balão fixo WhatsApp z-50 com texto nowrap | Possível cobertura de logo/conteúdo e ações em tela estreita. Confirmar visualmente; evitar sobreposição na etapa de UX aprovada. |
| Média | Cards de usuários usam linhas flex sem quebra em textos longos | Risco de overflow com nomes/e-mails em mobile. Testar zoom 200%, largura 320–390 px e textos extensos. |
| Baixa | Links ativos só têm estilo visual; botões de excluir por ícone sem nome acessível | Adicionar aria-current e nomes acessíveis quando autorizadas as alterações. |

Aspectos positivos: navegação lateral consistente, fechamento do menu ao escolher item, destaque visual da rota atual, grades responsivas, identidade entregue pelo servidor e logout que aguarda revogação. Não há progresso, retomada ou histórico de aula atualmente; não confundir duração fixa com progresso real.

Os caracteres estranhos vistos em algumas saídas PowerShell não foram classificados como defeito visual: os arquivos foram também lidos em UTF-8. Confirmar texto renderizado no navegador antes de propor correções de codificação.

## Plano de implementação em incrementos aprováveis

Usar o Next.js/Prisma existentes. Consultas em Server Components podem chamar uma camada server-only diretamente; criar Route Handlers para operações cliente/download/progresso que precisem de HTTP. Cada operação revalida sessão e autorização; um layout protegido não substitui validação na API.

| Etapa | Entrega pequena | Dados / contratos propostos | Critério de aceite |
| --- | --- | --- | --- |
| 1 | Listagem real de usuários, somente leitura | User existente; consulta paginada/search restrita com requireAdmin; `/api/admin/users` se necessário, detalhe por ID sem hashes/tokens | Contas locais aparecem, mocks deixam somente esta página, estudante recebe 403 mesmo com URL direta. |
| 2 | Situação real de assinatura, somente leitura | Subscription + Plan existentes; própria assinatura no aluno e consulta administrativa; mesmo predicado de período da guarda | Nome/status/validade consistentes; sem assinatura, início futuro e expirado têm mensagens corretas; nenhum Payment alterado. |
| 3 | Gestão controlada da validade | Operações administrativas específicas, motivo e AuditLog; política definida para concessão manual vs pagamento | Alteração autorizada/auditada, concorrência controlada, nenhuma aprovação de pagamento fabricada; histórico preservado. |
| 4 | Modelo e CRUD básico de aulas | Lesson: título, descrição, duração, ordem, referência de vídeo, estado draft/published/archived, publishedAt e auditoria; Course só se necessário | Criar/editar/arquivar persiste; entrada validada; admin protegido; testar migração somente em ambiente local aprovado. |
| 5 | Catálogo e reprodução do aluno | Mesma Lesson, filtro published e publishedAt <= agora; detalhe `/aluno/aulas/[id]`; autorização antes de entregar mídia/URL | Aula publicada aparece para assinante; rascunho/arquivado não; negado por ID direto; sem privilégios derivados do cliente. |
| 6 | Recursos: metadados e upload privado | Resource com título/descrição/tipo, storageKey privado, tamanho/MIME/checksum/capa, estado/publicação; endpoints admin | Upload validado, limites, sem path traversal ou URL arbitrária; metadado consistente após falha; sem PDFs privados em public. |
| 7 | Biblioteca e download real | `/api/resources/[id]/download`: requireActiveSubscription + publicado + chave privada; stream ou URL assinada curta | Assinante baixa arquivo válido; anônimo/expirado/bloqueado não; resposta privada/no-store e objeto bruto não público. |
| 8 | Configurações persistidas | Modelo SiteSettings tipado com campos permitidos; edição admin e leitura server-only/projeção pública mínima | Salvar + reload preserva; consumidor escolhido usa o mesmo dado; segredos jamais no formulário; sem alterar checkout/Hotmart. |
| 9 | Dashboard real | Contagens de User/assinaturas vigentes/Lesson/Resource publicados; novidades por publishedAt; AuditLog para atividades | Números batem com consultas. Engajamento só entra após definir evento, período e denominador; até lá não inventar porcentagem. |
| 10 | Progresso mínimo opcional | LessonProgress com unique(userId, lessonId), posição em segundos, completedAt, updatedAt; upsert próprio | Retoma após reload; acesso à aula validado; userId vem da sessão; progresso não concede acesso nem certificação. |
| 11 | Supervisão e feedback (escopo separado) | Decidir manter Forms ou criar Feedback, Supervision, Registration e Request; elegibilidade e dados mínimos | Sem duplicidade de submissões; confirmação e histórico; links/casos restritos protegidos; comunicação externa somente quando autorizada. |

Regras transversais: validar payloads e paginação; DTOs mínimos; impedir alteração de role/emailVerified/disabledAt por formulários genéricos; checar titularidade de objetos; proteger mutações contra CSRF/origem indevida; status e erros coerentes; testes de acesso direto; revalidar cache depois de publicar; dados privados sem cache compartilhado. Arquivar conteúdo com dependências em vez de apagar progresso/histórico. Arquivos privados precisam de decisão de armazenamento, sem provisionar serviços agora.

A migração dos mocks será por página/fluxo e apenas após aprovação: inventário → dados reais aprovados → persistência/consulta → teste → retirada do mock correspondente. Não importar automaticamente nomes, avaliações ou contagens fictícias. Conteúdo comercial externo permanece fora desse trabalho.

## Preparação do STUDENT local e testes manuais

Procedimento detalhado em [acesso-aluno-local.md](acesso-aluno-local.md). O script novo solicita e-mail/senha/confirmação ocultos, usa Better Auth, não promove o usuário e cria um plano próprio zero + assinatura sintética de 30 dias em transação. Não há alteração do schema nem Payment.

Comando: `node scripts/local-auth-student.cjs create`. Foi aberto um PowerShell interativo para esse comando; o cadastro definitivo depende do preenchimento pelo usuário. Não se presume sucesso antes da confirmação de commit. A conta de teste automatizado foi removida, e não substitui a conta manual.

Validação automatizada executada: `node --test tests/local-auth-student.test.cjs tests/local-auth-admin.test.cjs tests/auth-test-safety.test.cjs` — 12 testes aprovados. Cobriu destino SQL, recusa de identidade existente, hash real, STUDENT, assinatura de 30 dias, login, autorização de assinante, negação de ADMIN, expiração e rollback após falha. Comparação por digest confirmou que todas as sete tabelas voltaram ao estado anterior após remover apenas o fixture automatizado.

Também executado: `node --test --test-name-pattern='every private page|login and layout JSX' tests/private-access.test.cjs tests/real-login.test.cjs` — 2 contratos aprovados, confirmando preservação do markup das 12 páginas, login/layouts e hashes dos arquivos restritos. Esses dois contratos não executam as suítes de integração que pressupõem banco vazio.

Não executar runners que exigem banco vazio ou ausência de assinaturas depois de criar o aluno manual. Em particular, `test-auth-integration.cjs` e `local-auth-regression.cjs` têm pré-condições incompatíveis com a assinatura preservada; não apagar dados para satisfazê-los.

Somente scripts operacionais/testes/documentação foram alterados. Nenhum mock removido, CRUD implementado, página redesenhada, migration aplicada, serviço de produção acessado ou deploy executado. Próximo trabalho depende da aprovação do plano.
