# Webhook Mercado Pago — processamento de pagamentos únicos

## Escopo e pré-requisitos

O checkout, o schema e os planos existentes não foram modificados. Não há cobrança
recorrente automática: cada novo pagamento aprovado pode acrescentar um período.
Nenhuma migration, instalação, chamada real ao provedor ou alteração de banco foi
executada durante esta implementação.

Variáveis necessárias no servidor:

- `MERCADO_PAGO_ACCESS_TOKEN`: credencial da aplicação Mercado Pago.
- `MERCADO_PAGO_WEBHOOK_SECRET`: segredo de assinatura das notificações dessa aplicação.
- `NODE_ENV`: produção exige pagamento `live_mode: true`; outros ambientes exigem teste.

Nenhum segredo foi criado ou alterado nesta tarefa. Ausência de configuração retorna
HTTP 503. O código não utiliza o access token como segredo de assinatura.

## Bloqueio conhecido: identificação do beneficiário

**O checkout atual não envia uma referência à conta beneficiária. Por isso, novos
pagamentos desse checkout NÃO concederão acesso automaticamente nesta versão.**
O webhook retorna HTTP 422 `BENEFICIARY_REFERENCE_REQUIRED`, sem gravar User,
Subscription ou Payment. Isso é intencional: `payer.email` identifica o pagador,
não necessariamente quem deverá receber acesso. Não é usado como associação presumida.

O contrato previsto pelo processador é `payment.external_reference = User.id`,
obtido da API autenticada do provedor, apontando para uma conta já existente. Essa
referência deverá ser definida pelo servidor ao criar o checkout, a partir de uma
identidade confiável; nunca aceitar livremente um ID fornecido pelo navegador.
O contrato não está implementado no checkout e exige aprovação/implementação separada.
Não existe pedido local para reconciliar preferência, comprador e pagamento;
esta implementação não inventa essa associação nem cria usuários a partir do pagador.

Se a referência não corresponder a um usuário, retorna `BENEFICIARY_NOT_FOUND`.
Uma referência arbitrária legada não deve ser reinterpretada como ID de usuário:
antes de habilitar o fluxo real, homologar esse contrato e a aplicação de origem.
Pagamentos antigos já registrados e financeiramente consistentes são reconhecidos
como duplicados sem conceder acesso novamente e sem reparar dados históricos.

## Autenticidade e validação

- HMAC-SHA256 com comparação de tempo constante de `x-signature`.
- Manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
- ID vem do parâmetro de query `data.id`; deve coincidir com `body.data.id`.
- ID e status do pagamento são obtidos novamente em `/v1/payments/{id}`.
- Não se concede acesso com base no status enviado no corpo da notificação.
- Notificações IPN legadas sem assinatura são rejeitadas com 401. Não há fallback inseguro.
- Eventos de ordem assinados processam todos os IDs únicos, verificando o vínculo
  de cada pagamento com a ordem. O formato IPN antigo `{topic, id}` não é aceito.
- Não existe janela curta de timestamp: entregas atrasadas permanecem válidas;
  replays não concedem novos períodos devido à idempotência persistida.

Referência oficial consultada:
https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-content/notifications/webhooks

Condições para uma nova concessão:

- `status` exatamente `approved`;
- `currency_id` exatamente `BRL`;
- `metadata.source` igual a `site` e plano entre `mensal`, `trimestral`, `anual`;
- valores integrais em centavos: 5900, 13900, 49900, respectivamente;
- em desenvolvimento, 100 centavos, preservando o valor de teste do checkout,
  mas somente com pagamento de teste; um pagamento real de R$1 é rejeitado;
- `transaction_amount_refunded` igual a zero (ausência também exige revisão);
- referência explícita a usuário existente e plano correspondente cadastrado.

Os valores e durações espelham o checkout intacto. Não são deduzidos de
`Plan.price`/`Plan.duration`, cujas unidades/dados existentes não foram homologados.
O nome único do plano resolve a relação Prisma. Futuras alterações de preço exigem
reconciliação com pedido/preferência histórica; não simplesmente mudar constantes.

## Transações, duplicação e renovação

Consulta de Payment, leitura do usuário/plano/períodos e inserções de Payment e
Subscription ocorrem em uma transação `Serializable`. A restrição única existente
`Payment.mercadopagoId` é a chave de idempotência. Não há cache em memória como
garantia de unicidade.

Conflitos `P2034` e `P2002` repetem a transação completa, no máximo três tentativas.
Uma violação de unicidade isolada não é reconhecida como sucesso: a nova tentativa
deve encontrar um Payment consistente ou processar corretamente. Esgotamento
retorna 503, permitindo reentrega.

Uma nova assinatura começa no maior término de assinaturas `active` não vencidas,
ou agora se nenhuma existir. Inclui períodos futuros previamente pagos, considera
todos os planos e preserva todas as linhas anteriores. Acrescenta 1, 3 ou 12 meses
de calendário em UTC, limitando o dia ao último dia do mês de destino.

O schema não distingue concessões gratuitas de períodos pagos, nem liga Payment
diretamente a Subscription. Portanto, todos os períodos ativos existentes são
preservados; duplicações históricas não são removidas ou somadas artificialmente.

Para ordens com vários pagamentos, a atomicidade é por pagamento. Se o segundo
falhar após o primeiro confirmar, a ordem retorna erro; a reentrega reconhece o
primeiro como duplicado e retoma os demais sem conceder duas vezes.

## Respostas e limites

| HTTP | Significado |
| --- | --- |
| 200 | Processado, duplicado consistente ou evento/status sem nova concessão |
| 400 | JSON inválido ou ID divergente |
| 401 | Assinatura ausente/inválida ou formato legado não autenticável |
| 409 | Payment existente com valores/estado incompatíveis; revisão necessária |
| 422 | Pagamento não elegível ou vínculo de beneficiário ausente; não há gravação |
| 502 | Falha/timeout/resposta inválida do provedor; reentrega necessária |
| 503 | Configuração ausente, plano inexistente ou conflitos esgotados |
| 500 | Falha de persistência; transação revertida |

Não há confirmação falsa de sucesso em falha de persistência ou de consulta.
Respostas não expõem credenciais, e-mails, payloads financeiros ou erros internos.

Cancelamentos, estornos, chargebacks e estados pendentes não criam acesso. A
revogação de assinaturas já concedidas permanece pendente: sem relação financeira
persistida não é seguro escolher uma assinatura para revogar por suposição.
Não usar esta alteração como evidência de que o ciclo financeiro completo está pronto.
Também permanecem pendentes conciliação de histórico, fila durável, observabilidade
operacional e homologação da configuração de eventos no painel do Mercado Pago.

## Verificação local

```text
npm run test:webhook
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
```

O runner usa Node Test Runner e o TypeScript já instalado, compila somente o módulo
isolado em diretório temporário e remove esse artefato ao terminar. Não importa
Prisma em runtime, não carrega `.env` e não conecta ao banco/provedor.

O fake transacional permite callbacks simultâneos, snapshots, conflitos e rollback.
Os testes verificam a aplicação reagindo a esses comportamentos, não a implementação
real de isolamento do PostgreSQL. Antes da publicação, executar integração contra
PostgreSQL descartável, homologação com Mercado Pago em teste e validação do vínculo
de beneficiário aprovado. Nenhum desses ambientes externos foi usado nesta tarefa.
