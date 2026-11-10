# Dashboard do aluno — revisão de comunicação e layout

## Regra comercial

Existe um único catálogo. Os materiais vendidos individualmente na vitrine também estão incluídos na assinatura ativa, sem novo pagamento. Quem não assina pode comprar individualmente. Esta regra substitui a proposta anterior deste documento de catálogos comerciais e exclusivos separados.

O dashboard usa “Explorar Biblioteca de Materiais”, mantendo `/materiais`. A sidebar mantém `/aluno/recursos`. Esta etapa não unifica tecnicamente as listas legadas, não modifica checkout e não libera downloads. A vitrine mantém o comportamento comercial existente.

## Integração futura

1. Consolidar uma fonte única com IDs estáveis. Preservar capas, preços e destinos aprovados; mapear divergências das listas existentes sem associar arquivos por semelhança de títulos.
2. Validar cada download no servidor: sessão válida, material publicado e assinatura ativa **ou** direito de compra individual confirmado para esse material. Usar identidade da sessão. Flags do navegador e `isPremium` não autorizam acesso.
3. Manter arquivos privados fora de `public`; entregar stream ou URL assinada curta, sem cache compartilhado. Revalidar autorização em cada solicitação.
4. Cobrir anônimos, assinaturas expiradas/inativas, acesso por ID, material não publicado e compras de outros materiais. Compradores individuais acessam seus itens; assinantes ativos acessam o catálogo incluído sem nova compra.
5. Somente depois conectar downloads e adaptar a vitrine ao direito de acesso. Nenhuma alteração de pagamentos, planos ou webhooks integra esta entrega.

## Interface

- Nome, plano, status e vencimento preservam os leitores reais existentes. `SubscriptionSummary` não foi alterado.
- Cards, cores e tipografia preservados; espaçamentos reduzidos e gap interno duplicado removido.
- Biblioteca informa inclusão na assinatura e preparação do acesso aos arquivos.
- Destaque vazio removido. Não existe seleção persistida de destaque no modelo atual. Uma integração futura deve exigir aula explicitamente destacada, publicada e autorizada, sem escolher automaticamente a primeira aula.
- Sidebar usa “Minhas Aulas”, com a mesma rota e demais itens.
- Botão e convite do grupo WhatsApp ficam juntos no rodapé, no fluxo da página. O atalho na sidebar continua disponível. O componente flutuante público não é usado na área do aluno e foi preservado.
- Menu mobile recebe rótulo acessível e posição abaixo do cabeçalho; CTA da biblioteca permite quebra de linha.
- CRUD, páginas de aulas, estado vazio e permissões preservados.

## Validação — 06/11/2026

TypeScript aprovado: `node node_modules/typescript/bin/tsc --noEmit --incremental false`.

Regressão final: 28 aprovados, zero falhas:

```powershell
node --test --test-skip-pattern='real authorized|local PostgreSQL|persisted local|private page entry|real Better' tests/student-dashboard.test.cjs tests/lessons.test.cjs tests/private-access.test.cjs tests/real-login.test.cjs tests/materials-carousel.test.cjs tests/auth-test-safety.test.cjs tests/auth-preparation.test.cjs
```

Chromium headless com HTML dos componentes reais e CSS processado pelo Tailwind: 320, 375, 768, 1024 e 1440 px. Sem overflow horizontal, botões contidos e CTA abaixo dos oito cards. Nome vazio e assinatura indisponível, sem banco. Verificação estática, sem navegação autenticada/hidratação. Script temporário de inspeção removido após execução.

Contratos de regressão atualizados para as alterações autorizadas; rotas e handlers do layout continuam comparados ao baseline. Revisão com a skill `vercel:react-best-practices`: sem novas consultas, efeitos ou dependências; limites de autenticação mantidos.

### Desvio na primeira rodada

O filtro inicial `--test-name-pattern` não excluiu os testes integrados como pretendido. Foram 31 aprovados e dois bloqueados por `AUTH_TEST_TARGET_REJECTED`. Três testes locais PostgreSQL rodaram, incluindo fixtures temporários com limpeza/rollback e verificação de preservação dos registros existentes. Isso contrariou a restrição de não criar dados fictícios, embora os fixtures não tenham sido mantidos. A rodada final corrigiu a seleção com `--test-skip-pattern`.

Não houve acesso ao Neon, migrations, deploy nem alteração de código de pagamentos, planos, assinaturas ou webhook.

## Arquivos modificados

- `app/aluno/dashboard/page.tsx`
- `components/layout/MemberLayout.tsx`
- `tests/student-dashboard.test.cjs`
- `tests/private-access.test.cjs`
- `tests/real-login.test.cjs`
- `docs/dashboard-aluno-real.md`

Etapa encerrada, aguardando aprovação.
