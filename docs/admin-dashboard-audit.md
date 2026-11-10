# Auditoria administrativa e dashboard real

Data: 06/11/2026. Escopo implementado: somente indicadores e estados do dashboard administrativo. Demais CRUDs aguardam aprovação.

## Instruções e fontes consultadas

Não foi encontrado `AGENTS.md` na árvore do projeto nem nos diretórios ancestrais consultados. Foram consultados README, documentação de aulas, código das guardas, schema Prisma e scripts de segurança local antes da implementação. O README descreve parte do protótipo antigo (Context API/ProtectedRoute, recursos privados e funcionalidades planejadas); o código atual e os contratos server-side são a fonte desta auditoria.

## Rotas, dependências e relação com o aluno

`app/admin/layout.tsx` exige ADMIN e define execução dinâmica em Node.js. Cada página administrativa também chama `requirePageAccess("admin")`. A autorização consulta sessão Better Auth e o papel/estado atual do usuário no banco; usuário desabilitado ou STUDENT não recebe acesso administrativo. O dashboard mantém essas guardas e seu leitor exige `requireAdmin` antes de consultar agregados. Não há endpoint novo nem cache compartilhado de indicadores.

| Funcionalidade / rotas | Situação atual | Dependências | Operações necessárias | Prioridade |
| --- | --- | --- | --- | --- |
| Dashboard `/admin/dashboard` | Implementado nesta etapa: cinco contagens reais em quatro cards; estados indisponível e zero distintos | User, Subscription, Lesson; autorização ADMIN | Manutenção das definições e testes; nenhuma mutação | Entregue |
| Gerenciar Aulas `/admin/aulas`; `/api/admin/lessons` e `/[id]` | Real: listar, criar rascunho, editar, publicar/despublicar, ordenar e arquivar. Sem exclusão permanente | Lesson, validação de payload/origem, autorização ADMIN | Preservar serviço e gerenciador existentes; não reimplementar | Entregue anteriormente |
| Aulas do aluno `/aluno/aulas`, `/aluno/aulas/[id]` | Consulta o mesmo Lesson, somente PUBLISHED; reprodução exige assinatura vigente | Sessão habilitada, Subscription vigente; YouTube/Vimeo | Nenhuma alteração nesta etapa; hospedagem privada mais restrita requer projeto próprio | Preservar |
| Biblioteca `/admin/recursos`, `/aluno/recursos`, `/materiais` | Admin usa dois recursos estáticos, botões sem CRUD; biblioteca e vitrine têm listas locais distintas. Não existe modelo Material | Catálogo único, IDs estáveis, armazenamento privado, autorização por assinatura ou compra individual | Consolidar catálogo; criar/editar/publicar/arquivar; upload seguro; download autorizado no servidor; mapear itens legados sem adivinhar equivalências | P1 |
| Usuários e Assinaturas `/admin/usuarios` | Tela com três usuários demonstrativos. User, Plan e Subscription são reais, mas a tela não os consulta; botões não gerenciam o banco | Consultas paginadas, filtro por papel/status, políticas de privacidade e auditoria | Primeiro substituir lista por leitura real; detalhar assinaturas. Qualquer bloqueio, mudança de papel ou assinatura exige escopo e validações próprios | P1 |
| Supervisões `/aluno/supervisoes`, `/aluno/solicitar-supervisao` | Agenda estática; solicitação abre Google Forms. Não há rota administrativa, tabela ou API | Agenda, permissões, política para dados sensíveis, fluxo de análise das solicitações | Criar/editar/publicar/cancelar encontros; registrar e acompanhar solicitações; definir integração externa | P2 |
| Avaliações e Sugestões `/aluno/avaliacao`, `/aluno/sugestoes` | CTAs para formulários externos; sem modelo/API/inbox administrativa. Não há feedback persistido na plataforma | Definir origem e integração das respostas, consentimento e acesso | Receber/importar respostas; listar, filtrar e tratar; não fabricar notas ou depoimentos | P2 |
| Configurações `/admin/configuracoes` | Formulário com valores estáticos e botão salvar sem persistência | Modelo/configuração validada, autorização, auditoria | Leitura e atualização de campos permitidos; não expor segredos ou credenciais comerciais | P3 |
| Atividade recente e engajamento | Eventos do dashboard eram textos fixos; não há trilha/progresso que sustente métricas | Definição verificável de evento, janela, denominador e retenção | Instrumentar eventos e trilha de auditoria antes de calcular indicadores | P3 |

`services/api.ts` e hooks `useLessons`/`useResources` ainda contêm simulações legadas; não estão conectados às páginas administrativas/aulas atuais. A existência desses métodos não representa CRUD persistente.

## Sidebar

Preservada sem novos links: Dashboard, Gerenciar Aulas, Gerenciar Recursos, Usuários, Configurações. Todas as rotas existem, mas recursos, usuários e configurações ainda são protótipos, conforme matriz. Organização futura proposta: “Gerenciar Recursos” → “Biblioteca de Materiais”; “Usuários” → “Usuários e Assinaturas”, mantendo URLs. Supervisões e Avaliações e Sugestões só devem ganhar itens quando as respectivas rotas estiverem funcionais. Não foram criados destinos inexistentes.

## Definições dos indicadores

- **Alunos cadastrados:** `User.role = STUDENT`, incluindo contas desabilitadas; ADMIN não entra. Não é uma métrica de atividade.
- **Assinaturas ativas:** registros `status = active`, `startDate <= instante da consulta` e `endDate > instante da consulta`, como a guarda vigente. Conta assinaturas, não pessoas; não filtra papel ou estado da conta, nem significa usuários autorizados únicos.
- **Próximas do vencimento:** subconjunto das assinaturas vigentes com `endDate <= instante + 7 × 24 horas`. Exclui as já vencidas e futuras. Não projeta renovação nem consolida múltiplos contratos.
- **Aulas cadastradas:** todos os registros Lesson, inclusive DRAFT e ARCHIVED. O mesmo card informa a contagem de PUBLISHED.
- As cinco leituras usam uma transação RepeatableRead e um único instante para consistência. Só contagens e horário chegam à apresentação; nenhum registro individual ou segredo é retornado.
- Falha de consulta resulta em “Indicadores indisponíveis” e ação de tentar novamente; não em zeros. Falha de autorização propaga e não é convertida em estado vazio.
- Não existem números demonstrativos 156, 24, 120 ou 89%, atividades inventadas nem taxa de engajamento. Zero é apresentado apenas quando retornado pelo banco.

## Identidade visual e acesso

Mantidos AdminLayout, sidebar, título, cores, cards e duas seções inferiores. A grade usa duas colunas a partir de `sm` e quatro a partir de `xl`: evita cards estreitos junto à sidebar em 1024 px. Os ícones são decorativos, os indicadores possuem títulos e a falha de leitura tem `role=status`. Links apontam somente para dashboard e gerenciamento de aulas já existente.

## Regra comercial preservada

O catálogo futuro é único: materiais incluídos na assinatura vigente e os mesmos produtos vendidos individualmente na vitrine. Cada download deverá validar no servidor sessão, publicação e assinatura vigente ou direito de compra daquele material. Nenhum download foi liberado. Hotmart, Mercado Pago, checkout e webhook não foram modificados.

## Verificações executadas

1. `node node_modules/typescript/bin/tsc --noEmit --incremental false` — aprovado.
2. `node scripts/check-admin-dashboard-local.cjs` — aprovado. Lê somente `.env.auth-test.local`, valida endereço/banco/usuário antes da conexão e identidade do servidor após conexão. Usa transação **READ ONLY** e RepeatableRead, sem sign-in, escrita de sessão, seeds ou migrations. Agregados Prisma conferidos com SQL independente: **1 aluno, 1 assinatura vigente, 0 vencimentos em sete dias, 0 aulas, 0 publicadas** no instante da verificação. Consulta o ADMIN/STUDENT local existente; a identidade de sessão é injetada exclusivamente no script, e o papel é validado pela autorização real com consulta ao banco. STUDENT foi recusado. Isso não é um teste HTTP de sessão autenticada.
3. Regressão: **31 testes aprovados, zero falhas**, com exclusão explícita dos testes que criam fixtures ou sessões:

```powershell
node --test --test-skip-pattern='real authorized|local PostgreSQL|persisted local|private page entry|real Better' tests/admin-dashboard.test.cjs tests/student-dashboard.test.cjs tests/lessons.test.cjs tests/private-access.test.cjs tests/real-login.test.cjs tests/materials-carousel.test.cjs tests/auth-test-safety.test.cjs tests/auth-preparation.test.cjs
```

Os três testes novos cobrem recusa antes de tocar no banco, filtros/limites temporais, snapshot consistente, erro de infraestrutura e renderização de indisponibilidade versus zero. Os substitutos usados nesses testes vivem apenas em memória; nenhum registro é criado.

4. Chromium headless, componentes reais renderizados estaticamente com Tailwind e agregados reais locais: **320, 375, 768, 1024 e 1440 px**, sem overflow horizontal e com seis cards contidos. Não cobre hidratação, login ou interação do menu. Não foi iniciado servidor nem renovada sessão. Script visual temporário removido após execução.

Sem Neon, deploy, migrations, mudança de schema, credenciais, assinaturas, autenticação ou fluxos comerciais. Nenhum dado fictício/fixture foi inserido, mesmo temporariamente, nesta etapa.

## Arquivos desta etapa

- `app/admin/dashboard/page.tsx`
- `lib/admin/dashboard-core.ts`
- `lib/admin/dashboard.ts`
- `tests/admin-dashboard.test.cjs`
- `tests/private-access.test.cjs` (exceção específica para o dashboard autorizado; demais páginas continuam protegidas pelo baseline)
- `scripts/check-admin-dashboard-local.cjs`
- `docs/admin-dashboard-audit.md`

Etapa encerrada. Demais CRUDs e alterações de sidebar aguardam aprovação.
