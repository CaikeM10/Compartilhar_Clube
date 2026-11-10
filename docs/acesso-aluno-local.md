# Conta STUDENT para teste manual

## Criar

Na raiz do projeto, use um PowerShell interativo:

```powershell
node scripts/local-auth-student.cjs create
```

O assistente abriu uma janela para esse comando. Se ela não estiver visível ou já tiver sido fechada, execute o comando acima. Informe um e-mail diferente do ADMIN, senha de 8 a 128 caracteres e confirmação. A entrada fica oculta, inclusive o e-mail; não aparece nem asterisco. Não coloque senha em argumentos, arquivo, variável de ambiente ou conversa.

O comando valida exclusivamente `.env.auth-test.local` e a identidade SQL `127.0.0.1:5432/compartilhar_auth_test`, usuário `compartilhar_auth_test_user`. Ignora o `.env` e DATABASE_URL herdado. Usa o Better Auth da aplicação para gerar hash em Account, mantém STUDENT e emailVerified falso, e cria:

- Um plano novo `LOCAL_STUDENT_TEST_30D_<identificador aleatório>`, preço zero e duração 30.
- Uma assinatura nova com status `active`, início no instante do cadastro e fim 30 dias depois.
- Nenhum Payment e nenhuma alteração em planos/assinaturas/usuários já existentes.

Tudo é transacional. Se falhar, o cadastro e a assinatura são revertidos juntos. Se o e-mail já existir, o comando recusa sem trocar senha ou papel. Depois do sucesso, a conta e a assinatura ficam preservadas. Não há renovação automática nem envio de e-mail. O nome de teste é “Aluno local de testes”.

Para verificar depois, sem informar senha:

```powershell
node scripts/local-auth-student.cjs check
```

Informe o mesmo e-mail no prompt oculto. O comando mostra somente prontidão e validade, sem hashes/segredos. `EXISTING_ACCOUNT_REFUSED` não significa que deva recriar a conta; use `check` primeiro. `LOCAL_STUDENT_NOT_READY` significa que a conta não atende aos critérios de STUDENT com credencial e assinatura sintética vigente; não altera nada.

## Entrar no navegador

Mantenha o servidor local que já funciona. Se precisar iniciar novamente:

```powershell
pnpm dev
```

Abra uma janela anônima ou outro perfil do navegador e acesse `http://127.0.0.1:3000/login`. Isso permite manter a sessão ADMIN na janela normal. Entre com o e-mail/senha informados: o destino esperado é `/aluno/dashboard`.

Os 30 dias permitem abrir aulas, recursos, supervisões e solicitação de supervisão. Essa concessão real de acesso não transforma os conteúdos mockados em funcionalidades reais: assistir/participar continuam sem operação, e os PDFs ainda estão ausentes.

## Roteiro de teste

| Passo | Resultado esperado |
| --- | --- |
| Login com conta STUDENT | Dashboard do aluno; nome/e-mail do aluno no menu. |
| Recarregar página | Sessão preservada enquanto o servidor não for reiniciado. |
| Visitar as 7 páginas do aluno | Dashboard, aulas, materiais, avaliação, sugestões, supervisões e solicitação abrem conforme a assinatura vigente. |
| Abrir `/admin/dashboard` e `/admin/usuarios` diretamente | Acesso recusado pelo servidor; redirecionamento para `/login?reason=access-denied`. |
| Comparar catálogos admin/aluno | Diferenças documentadas; nenhuma publicação/salvamento real neste estágio. |
| Desktop 1280/1440 e mobile 360/390 px | Conferir sidebar, fechar menu, rolagem, balão WhatsApp, botões, textos longos e capa ausente. |
| Teclado e zoom 200% | Registrar foco do menu/overlay, tabulação e overflow; problemas já listados na auditoria. |
| Logout e tentativa de reabrir área privada | Exige novo login. |

Não é necessário submeter Google Forms, usar checkout ou acessar Hotmart para avaliar estas telas. Evite registrar casos clínicos reais durante os testes.

Arquivos entregues: `scripts/local-auth-student.cjs`, `tests/local-auth-student.test.cjs`; `local-auth-admin.cjs` apenas exporta a função existente de prompt oculto para reutilização. Nenhum modelo, endpoint de CRUD ou layout foi alterado.

As suítes que pressupõem banco vazio/zero assinaturas não devem ser executadas sobre a conta manual preservada. Os testes novos usam fixture próprio e removem apenas seus IDs.
