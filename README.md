# Lupus CRM PRD

Você é um Arquiteto de Software Sênior especializado em CRM SaaS.

Desenvolva um CRM moderno inspirado no Kommo CRM, porém com arquitetura própria, código limpo, escalável e preparado para milhares de usuários simultâneos.

O sistema deverá ser responsivo (Desktop, Tablet e Mobile), possuir interface extremamente moderna semelhante ao Kommo, Hubspot e Monday.com.

Stack

Frontend React + Typescript

TailwindCSS

Shadcn/UI

Backend Supabase

PostgreSQL

Edge Functions

Realtime

Storage

Row Level Security

Autenticação Supabase Auth

Deploy preparado para Vercel



Objetivo

Criar um CRM Conversacional onde todas as vendas são iniciadas através de conversas.

Toda conversa gera automaticamente um Lead.

Os Leads percorrem um Pipeline de vendas.

Cada Lead possui histórico completo.

Toda informação deve ficar centralizada em uma única tela.



Módulos

Dashboard

Mostrar:

Total de Leads

Novos Leads hoje

Conversas em aberto

Negócios ganhos

Negócios perdidos

Receita prevista

Receita realizada

Conversões

Tempo médio de fechamento

Atividades do dia

Próximas tarefas

Gráficos:

Leads por origem

Vendas por mês

Conversas por canal

Conversões por vendedor

Pipeline



CRM

Cadastrar

Pessoa Física

Campos:

Nome

Telefone

Whatsapp

Email

CPF

Nascimento

Empresa

Cargo

Tags

Observações

Endereço

Cidade

Estado

CEP



Pessoa Jurídica

Razão Social

Nome Fantasia

CNPJ

Telefone

Whatsapp

Email

Responsável

Segmento

Funcionários

Faturamento

Tags



Cada cliente possui:

Timeline

Histórico

Arquivos

Anotações

Conversas

Atividades

Propostas

Pedidos

Contratos

Financeiro



Pipeline

Pipeline estilo Kanban.

Arrastar cartões.

Etapas configuráveis.

Exemplo:

Novo Lead

Contato

Qualificado

Proposta

Negociação

Fechado Ganho

Fechado Perdido

Ao mover cartões devem disparar automações.

Cada cartão mostra:

Nome

Empresa

Valor

Origem

Responsável

Última interação

Tempo parado

Tags

Prioridade



Conversas

Inbox unificada.

Conectar:

WhatsApp Business

Instagram

Facebook Messenger

Telegram

Email

Webchat

Cada conversa deve exibir:

Mensagens

Áudios

Vídeos

Imagens

Documentos

Localização

Reações

Status

Digitando…

Lido

Entregue

Mensagens rápidas

Modelos

Respostas prontas

Notas internas

Mencionar usuários

Transferir atendimento

Assumir conversa



WhatsApp

Integração via API oficial Meta.

Suportar:

Texto

Imagem

PDF

Áudio

Vídeo

Botões

Listas

Carrossel

Templates

Fluxos

Mensagens em massa

Campanhas

Múltiplos números

Distribuição automática

Filas

Horário comercial



IA

Assistente IA integrado.

Funções:

Responder clientes

Resumir conversa

Melhorar texto

Corrigir português

Traduzir

Gerar propostas

Gerar e-mails

Criar tarefas

Identificar intenção

Classificar lead

Score automático

Sugerir próxima ação

Responder FAQs

Pesquisar CRM inteiro

Gerar insights



Automações

Construtor visual semelhante ao n8n.

Trigger

↓

Condição

↓

Ação

Exemplos:

Nova mensagem

↓

Criar Lead

Nova etapa

↓

Enviar WhatsApp

Lead parado

↓

Criar tarefa

Sem resposta 24h

↓

Enviar lembrete

Cliente comprou

↓

Mover pipeline

Webhook recebido

↓

Atualizar cadastro



Agenda

Calendário

Google Calendar

Outlook

Reuniões

Visitas

Tarefas

Lembretes

Recorrências



Tarefas

Criar

Editar

Concluir

Delegar

Prioridade

Checklist

Anexos

Comentários



Produtos

Cadastro

Categoria

Preço

Estoque

Imagens

Descrição

SKU

Impostos



Propostas

Criador visual.

PDF automático.

Assinatura eletrônica.

Envio por WhatsApp.

Envio por Email.



Financeiro

Receitas

Despesas

Comissões

Parcelas

Boletos

PIX

Cartão

Fluxo de Caixa

DRE simplificada



Marketing

Landing Pages

Formulários

Captura de Leads

UTM

Facebook Ads

Google Ads

Meta Pixel

Conversões

Campanhas

Email Marketing

WhatsApp Broadcast



Relatórios

Conversão

Receita

Pipeline

Equipe

Tempo médio

Origem dos Leads

Campanhas

Produtos

Clientes

Atendimentos

Exportar PDF

Exportar Excel



Administração

Usuários

Perfis

Permissões

Equipes

Departamentos

Filiais

Auditoria

Logs

API Keys

Webhooks



Configurações

Pipelines ilimitados

Campos personalizados

Tags

Categorias

Motivos de perda

Motivos de ganho

Templates

Respostas rápidas

Assinaturas

Domínio personalizado

Branding

Tema Claro/Escuro

Idiomas



UX

Interface inspirada no Kommo.

Menu lateral recolhível.

Dark Mode.

Pesquisa global.

Command Palette.

Atalhos de teclado.

Drag and Drop.

Realtime.

Loading Skeleton.

Infinite Scroll.

Notificações Toast.

Animações suaves.



Banco de Dados

Criar todas as tabelas relacionais necessárias.

Utilizar UUID.

Soft Delete.

Created At.

Updated At.

Deleted At.

Row Level Security.



Segurança

JWT

RLS

Permissões por função

Criptografia

Logs

Rate Limit

LGPD



Escalabilidade

Sistema preparado para:

100 empresas

1.000 usuários

1 milhão de mensagens

10 milhões de leads



Entrega

Gerar:

Estrutura completa do banco de dados.

Todas as telas.

Componentes reutilizáveis.

Navegação completa.

Backend.

APIs.

Fluxos.

Seeds de exemplo.

Código organizado em módulos.

Código comentado.

Design profissional semelhante ao Kommo, porém sem copiar identidade visual ou logotipos.



Minha sugestão

Como você comentou anteriormente que pretende criar a Lupus Assessoria, eu iria além de um clone da Kommo e faria um produto “Kommo + IA”, com diferenciais como:

IA atendendo automaticamente pelo WhatsApp.

Transcrição de áudios.

Leitura de PDFs, imagens e documentos enviados pelo cliente.

Resumos automáticos de conversas.

Follow-up inteligente baseado na probabilidade de conversão.

Geração automática de propostas e contratos.

Painel para múltiplas empresas (multi-tenant/SaaS).

Integração com ERP, NFS-e e PIX.

Agentes de IA especializados (Vendas, Suporte, Financeiro e Pós-venda). Esses recursos aproveitam tendências atuais de CRMs conversacionais com automação e IA, mas mantêm uma implementação própria.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://thiagaycrm.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3f03414f-c100-4861-aba8-30bf563c6c65).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
