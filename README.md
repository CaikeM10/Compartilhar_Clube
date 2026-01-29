# Compartilhar Clube - Plataforma de Aprendizagem

Plataforma web completa para a comunidade de aprendizagem e formação continuada Compartilhar Clube, voltada para professores, psicólogos, psicopedagogos e profissionais da educação.

## Características Principais

### Site Institucional

- Página inicial com apresentação do clube
- Seção "O que é o Compartilhar Clube"
- Seção "O que você encontra no clube" com cards informativos
- Páginas de Recursos e Clube de Assinatura
- Página de Materiais Individuais para aqueles que não querem assinar o clube
- Formulário de contato com informações de WhatsApp e Instagram

### Área do Aluno (Membros)

- Dashboard personalizado com estatísticas
- Aulas gravadas organizadas por ordem
- Biblioteca de recursos em PDF para download
- Supervisões de caso em grupo
- Formulário de solicitação de supervisão individual (PP)
- Formulário de avaliação
- Formulário de sugestões
- Botão flutuante para acesso ao grupo do WhatsApp

### Área Administrativa

- Dashboard com métricas e atividade recente
- Gerenciamento de aulas (cadastro, edição, ativar/desativar)
- Gerenciamento de recursos PDF (cadastro, edição, ativar/desativar)
- Visualização de usuários
- Configurações da plataforma

## Tecnologias Utilizadas

- **Framework**: Next.js 16 (App Router)
- **Linguagem**: TypeScript
- **Estilização**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Fontes**: Inter (corpo) e Poppins (títulos)
- **Autenticação**: Context API (preparado para integração com backend)

## Identidade Visual

### Cores da Marca

- **Azul Petróleo** (#2f4a70) - Cor principal
- **Amarelo Mostarda** (#e1b12c) - Cor de destaque / CTAs
- **Azul Acinzentado** (#4a6278) - Secundária
- **Terracota** (#b55239) - Secundária
- **Branco** - Base

## Estrutura do Projeto

```
src/
├── app/
│   ├── (public pages)/
│   │   ├── page.tsx                 # Home
│   │   ├── recursos/
│   │   ├── clube/
│   │   └── contato/
│   ├── login/
│   ├── recuperar-senha/
│   ├── aluno/                       # Área do aluno
│   │   ├── dashboard/
│   │   ├── aulas/
│   │   ├── recursos/
│   │   ├── supervisoes/
│   │   ├── solicitar-supervisao/
│   │   ├── avaliacao/
│   │   └── sugestoes/
│   └── admin/                       # Área administrativa
│       ├── dashboard/
│       ├── aulas/
│       ├── recursos/
│       ├── usuarios/
│       └── configuracoes/
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── Container.tsx
│   │   ├── MemberLayout.tsx
│   │   └── AdminLayout.tsx
│   ├── ui/                          # shadcn components
│   └── ProtectedRoute.tsx
├── contexts/
│   └── AuthContext.tsx
├── services/
│   └── api.ts                       # API service layer
├── hooks/
│   ├── useLessons.ts
│   └── useResources.ts
├── lib/
│   ├── types.ts
│   └── utils.ts
└── globals.css
```

## Como Executar

1. Instale as dependências:

```bash
npm install
```

2. Execute o servidor de desenvolvimento:

```bash
npm run dev
```

3. Abra [http://localhost:3000](http://localhost:3000) no navegador.

## Funcionalidades de Segurança

- Rotas protegidas com ProtectedRoute
- Verificação de permissões (admin vs. aluno)
- PDFs nunca acessíveis por link público
- Sistema de flags de acesso (hasAccess, locked)

## Próximas Etapas e Melhorias Futuras

### Backend e Integração

1. **Banco de Dados**
   - Escolher e configurar banco (Supabase, Neon, PostgreSQL)
   - Criar migrations para tabelas (users, lessons, resources, supervisions, feedback)
   - Implementar Row Level Security (RLS) se usar Supabase

2. **Autenticação Real**
   - Implementar autenticação com Supabase Auth ou NextAuth
   - Sistema de recuperação de senha funcional
   - Verificação de email
   - Sessões seguras com HTTP-only cookies

3. **API Routes**
   - Criar API routes para CRUD de aulas (/api/lessons)
   - Criar API routes para CRUD de recursos (/api/resources)
   - API para gerenciamento de usuários (/api/users)
   - API para feedback e formulários (/api/feedback)
   - Endpoints protegidos com middleware de autenticação

### Upload e Gerenciamento de Arquivos

1. **Upload de Vídeos**
   - Integração com serviço de vídeo (Vimeo, YouTube privado, Cloudflare Stream)
   - Sistema de upload de vídeos no admin
   - Player customizado para aulas

2. **Upload de PDFs**
   - Sistema de upload seguro de arquivos PDF
   - Armazenamento em Vercel Blob ou S3
   - URLs assinadas para acesso seguro aos PDFs
   - Preview de PDFs antes do download

### Sistema de Assinatura

1. **Integração com Pagamento**
   - Integração com Stripe para assinaturas mensais
   - Webhooks para gerenciar status de assinatura
   - Planos diferenciados (estudante, profissional, etc.)
   - Período de teste gratuito

2. **Controle de Acesso Baseado em Assinatura**
   - Verificação automática de status de assinatura
   - Bloqueio de conteúdo para assinaturas expiradas
   - Notificações de renovação

### Features Adicionais

1. **Notificações**
   - Sistema de notificações in-app
   - Email notifications para novas aulas
   - Lembretes de supervisões agendadas

2. **Certificados**
   - Geração automática de certificados de conclusão
   - Template personalizado com logo do clube
   - Download em PDF

3. **Progresso do Aluno**
   - Tracking de aulas assistidas
   - Percentual de conclusão de cursos
   - Histórico de recursos baixados

4. **Comunidade**
   - Fórum de discussão entre membros
   - Comentários nas aulas
   - Sistema de perguntas e respostas

5. **Analytics**
   - Dashboard com métricas de engajamento
   - Aulas mais assistidas
   - Recursos mais baixados
   - Taxa de retenção de alunos

### Melhorias de UX/UI

1. **Responsividade**
   - Testes em dispositivos móveis
   - Ajustes finos de layout mobile

2. **Acessibilidade**
   - Melhorar navegação por teclado
   - Adicionar mais ARIA labels
   - Testes com leitores de tela

3. **Performance**
   - Otimização de imagens
   - Lazy loading de componentes
   - Code splitting adicional

4. **SEO**
   - Metadata dinâmica por página
   - Sitemap XML
   - robots.txt configurado

### Testes

1. **Testes Unitários**
   - Jest + React Testing Library
   - Testes de componentes principais

2. **Testes E2E**
   - Playwright para fluxos críticos
   - Login, navegação, formulários

3. **Testes de Integração**
   - Testes de API routes
   - Testes de autenticação

### DevOps

1. **CI/CD**
   - GitHub Actions para deploy automático
   - Testes automáticos no PR

2. **Monitoramento**
   - Sentry para error tracking
   - Analytics de uso

3. **Backup**
   - Backups automáticos do banco
   - Backup de arquivos uploaded

## Observações Importantes

### Ética Profissional

- Supervisões de casos clínicos da psicologia são exclusivas para psicólogos
- Respeito ao sigilo profissional e código de ética
- Outras supervisões abertas para todos os membros

### Contatos Padrão (Atualizar)

- Email: contato@compartilharclube.com.br
- WhatsApp: (85) 92162-8747
- Instagram: @compartilharclube

## Licença

Propriedade de Wesley Marques - Compartilhar Clube

## Suporte

Para dúvidas sobre a plataforma, entre em contato através dos canais oficiais do Compartilhar Clube.
