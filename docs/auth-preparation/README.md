# Preparação de autenticação — parcial, sem ativação

## Retomada: diagnóstico do ambiente

- Node 22.17.0, Corepack 0.33.0 e pnpm 10.20.0 confirmados. O shim pnpm.ps1 encaminha para Corepack; não é necessário atualizar Node ou executar como administrador.
- `pnpm config get store-dir` retorna undefined; `pnpm store path` resolve o fallback do workspace `.pnpm-store/v10`. A instalação existente registra `C:\Users\caike\AppData\Local\pnpm\store\v10` em node_modules/.modules.yaml. Essa diferença explica ERR_PNPM_UNEXPECTED_STORE. Não há evidência de corrupção do lockfile/cache.
- Registry configurado corretamente: https://registry.npmjs.org/. Um fetch HTTPS direto por Node também falha com EACCES, independentemente do pnpm. A sessão possui restrições de rede e escrita externa; não foi possível distinguir mecanismos adicionais de firewall/antivírus. Não é seguro atribuir o erro a permissões NTFS do cache apenas.
- Nenhum cache global, lockfile ou node_modules foi removido. Better Auth continua não instalado; contrato efetivo do adaptador e árvore transitiva permanecem pendentes.
- PostgreSQL 18 local está Running e psql existe em Program Files/PostgreSQL/18/bin. Nenhum banco/usuário de teste foi identificado ou fornecido. Não houve conexão a esse serviço. Docker service está Stopped e o pipe docker_engine está ausente; leitura da configuração Docker do usuário também é negada nesta sessão.
- Prisma validate passou. Prisma generate passou em schema temporário dentro do projeto com output exclusivo no TEMP; o cliente operacional não foi substituído. A primeira tentativa com schema fora do projeto falhou na resolução de @prisma/client e foi corrigida mantendo o schema temporário sob a árvore do projeto. Arquivo temporário removido após geração.
- DATABASE_URL foi sobrescrita somente no processo filho por endereço local inutilizável (porta 1); validate/generate não consultaram banco. O arquivo .env não foi alterado.
- TypeScript passou; preparação 3, carrossel 13 e webhook 58 testes passaram. Não são testes de integração Better Auth.

### Ação manual mínima para desbloquear

Em um terminal normal do usuário, na raiz do projeto, confirmar `pnpm --version` = 10.20.0 e testar `node -e "fetch('https://registry.npmjs.org/better-auth/1.7.17').then(r=>console.log(r.status)).catch(e=>console.log(e.cause?.code))"`.

Se houver acesso, instalar sem mudar configuração global:

```powershell
pnpm add --save-exact better-auth@1.7.17 --store-dir "$env:LOCALAPPDATA\pnpm\store" --ignore-scripts
```

Revisar package.json e pnpm-lock.yaml depois. Não usar --force, não remover node_modules e não desabilitar TLS. Se o fetch também falhar fora da sessão, liberar o registry no proxy/firewall conforme a política local. Se a versão não estiver disponível, parar e informar; não substituir por latest.

Para testes PostgreSQL, criar banco descartável `compartilhar_auth_test` com usuário exclusivo no servidor local (ou iniciar Docker Desktop e criar container dedicado), sem dados reais. Disponibilizar TEST_DATABASE_URL apenas no ambiente local, não em mensagens. Confirmar explicitamente host local e nome do banco antes de qualquer escrita. Não reutilizar DATABASE_URL. Nenhuma dessas operações manuais foi executada pelo agente.

## Estado

- `packageManager`: pnpm 10.20.0. O executável inicialmente reportou 10.33.4; depois da configuração, `pnpm --version` retornou 10.20.0.
- Better Auth 1.7.17 NÃO instalado. Tentativa de instalação encontrou store diferente e falha de rede; consulta posterior ao registro falhou com EACCES. Não foi reconstruído node_modules nem alterado o store global.
- Não há resolução efetiva ou homologação do adaptador instalado. Os modelos são a proposta aprovada, não um schema gerado por Better Auth.
- Prisma/Client 5.10.2, Next 16.0.10, React 19.2.0 permanecem como antes. Node local: 22.17.0.
- package-lock.json preservado. Busca local não encontrou referências em scripts/CI/deploy; configurações externas de deploy não foram verificadas.
- AuthContext, ProtectedRoute, layouts e integrações comerciais não foram alterados.
- Nenhum banco foi consultado ou alterado. Docker instalado, mas daemon indisponível; banco descartável NÃO foi criado.

## Artefatos e SQL

`before.prisma` é a cópia anterior à alteração. `proposed.sql` foi produzido pelo Prisma 5.10.2 com `migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script`, sem datasource ou shadow database.

O SQL adiciona Role, cinco colunas em users e três tabelas de autenticação com índices e FKs. Não altera campos anteriores, tabelas financeiras, e-mails ou IDs. Não cria credenciais nem administradores. O campo legado User.password permanece intacto.

SQL NÃO aplicado e intencionalmente fora de prisma/migrations. Revisar baseline/drift do ambiente antes de qualquer aplicação futura. ALTER TABLE exige locks; duração e impacto dependem do PostgreSQL e volume real. updatedAt inicial representa a preparação, não a última alteração histórica do usuário. @updatedAt é mantido pelo Prisma, não por trigger SQL. CUIDs são gerados pela aplicação, não por defaults SQL.

Não executar prisma generate na instalação usada pela aplicação antes do plano de ativação: cliente novo pode selecionar colunas ainda ausentes no banco. A geração e compilação do cliente proposto devem ocorrer em fixture isolada.

## Contrato de segurança pendente

- role adicional: input false e default STUDENT; emailVerified nunca aceito em cadastro/atualização pública.
- Login e sessões não implementados nesta etapa. Não há garantia nova de autorização em runtime.
- User.name permanece nullable: testar leitura de usuários antigos com nome nulo no adaptador real.
- Sem Account credential, usuário antigo precisa de ativação comprovando posse do e-mail; preservar User.id, nunca copiar User.password desconhecido.
- Verification.value é campo do contrato, não prova de hashing ou consumo único. Validar armazenamento, finalidade e concorrência na implementação dos tokens.
- Sessões HttpOnly, Secure em produção, SameSite=Lax e verificação no servidor; sem localStorage na implementação futura.

## Ambiente de teste a preparar quando Docker estiver disponível

Usar container PostgreSQL descartável, sem volume de produção, porta vinculada somente a 127.0.0.1 e senha aleatória por execução. Banco exclusivo `compartilhar_auth_test`; conexão passada como TEST_DATABASE_URL. O runner futuro deve rejeitar hosts remotos, nomes diferentes e ausência da variável, sem fallback para DATABASE_URL. Não carregar .env da aplicação.

Aplicar o schema anterior SOMENTE nesse banco; inserir fixtures com nome/senha nulos, senha legada opaca, planos, assinaturas e pagamentos sintéticos. Aplicar proposed.sql ali, comparar todos os campos históricos e relações, testar defaults/uniqueness/FKs. Só depois exercitar Better Auth, credenciais, sessões expiradas/revogadas, adulteração de cookie, papel enviado pelo cliente e ativação concorrente. Descartar o container após a execução. Esses testes de banco ainda NÃO foram executados.

## Variáveis futuras

DATABASE_URL existente permanece intocada. BETTER_AUTH_SECRET (alta entropia, somente servidor), BETTER_AUTH_URL (origem explícita), TEST_DATABASE_URL (descartável). Credenciais de envio e remetente dependem do provedor a escolher. Não incluir segredos reais em exemplos ou logs.

## Próxima revisão

Desbloquear acesso ao registry e resolver a instalação com pnpm 10.20.0, preservando o lockfile e sem atualizar outras dependências. Conferir peerDependencies e engines da árvore realmente resolvida e o contrato do adaptador 1.7.17. Em seguida, gerar cliente em fixture e executar integração PostgreSQL. Somente após essa homologação, aprovar login/logout/sessões e a aplicação coordenada de migrations. Não publicar o schema isoladamente como autenticação pronta.
