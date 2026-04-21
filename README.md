# BSR Tracker

Sistema de monitoramento de Best Seller Rank (BSR) da Amazon para o marketplace Brasil (A2Q3Y263D00KWC). Permite rastrear a posicao dos seus produtos no ranking, registrar historico de BSR e preco, calcular variacoes, gerar insights automaticos de precificacao e comparar desempenho entre produtos.

## Features

### Coleta e Dados
- Coleta automatica de BSR (principal e subcategoria) via Amazon SP-API
- Coleta de preco Buy Box junto com o BSR a cada execucao
- Categorias e subcategorias mapeadas para nomes em portugues
- Retry automatico em caso de erro 429 (rate limit) com backoff progressivo
- Delay de 3s entre ASINs para evitar quota exceeded

### Dashboard
- BSR da subcategoria como destaque principal nos cards
- Badge de tendencia nos cards: **Subindo**, **Caindo**, **Estavel** ou **Sem rank** (stockout)
- Alertas visuais para variacoes maiores que 30% (borda colorida + icone de alerta + negrito)
- Tratamento de stockout: produtos com BSR = 0 nao disparam alerta falso de variacao
- Ordenacao por multiplos criterios: mais recente, melhor BSR, maior/menor variacao, maior/menor preco
- Filtro de busca por nome do produto ou ASIN
- Bloqueio de cadastro de ASIN duplicado com validacao de formato
- Edicao do nome e remocao de produtos com confirmacao

### Detalhe do Produto
- Grafico unificado com 3 linhas: BSR Principal, BSR Subcategoria e Preco Buy Box
- Eixos duais invertidos (valores menores = melhor) + eixo de preco
- Filtro de periodo 7 / 14 / 30 dias / Tudo (afeta grafico e tabela)
- Coluna de preco na tabela de leituras recentes
- Exportacao de historico em CSV
- Menor, maior e preco atual no card "Historico de Preco"
- BSR medio ultimos 7 dias vs 7 dias anteriores com variacao percentual
- Analise Preco x BSR: agrupamento por faixas de preco com BSR medio por faixa
- Insight automatico baseado na variacao mais recente

### Comparacao de Produtos (`/compare`)
- Selecao de ate 3 produtos para comparacao lado a lado
- Grafico de linhas com BSR subcategoria de cada produto (eixo Y invertido)
- Filtro de periodo 7 / 14 / 30 dias / Tudo
- Tabela de metricas comparativas: BSR atual, BSR medio 7d, variacao 7d, menor preco

### Geral
- Modo escuro com persistencia no localStorage e deteccao de preferencia do sistema
- Cores dos graficos Recharts adaptadas para modo escuro
- Pagina de alertas com historico de variacoes e insights

## Arquitetura

```
bsrtracker/
├── src/                          # Frontend React (Vite)
│   ├── pages/
│   │   ├── Dashboard.tsx         # Cards de produtos, busca, ordenacao, alertas visuais
│   │   ├── ProductDetail.tsx     # Grafico unificado, tabela, analise preco x BSR
│   │   ├── Alerts.tsx            # Tabela de alertas gerados
│   │   └── Compare.tsx           # Comparacao entre ate 3 produtos
│   ├── components/
│   │   ├── Layout.tsx            # Layout principal (header, nav, footer, tema)
│   │   └── ui/                   # Componentes shadcn/ui (base-ui)
│   ├── lib/
│   │   ├── supabase.ts          # Cliente Supabase (anon key, frontend)
│   │   ├── insights.ts          # Logica de insight e calculo de variacao
│   │   ├── categoryMap.ts       # Mapeamento de IDs de categoria para nomes em PT
│   │   └── utils.ts             # Utilidade cn() para classnames
│   ├── App.tsx                   # Router (4 rotas)
│   └── main.tsx                  # Entry point React
├── api/                          # Serverless functions (Vercel)
│   ├── collect-bsr.js           # Coleta BSR + preco de todos os ASINs
│   ├── products.js              # GET produtos com BSR mais recente
│   ├── test-auth.js             # Diagnostico: testa OAuth SP-API
│   ├── test-spapi.js            # Diagnostico: testa conectividade SP-API
│   └── lib/
│       └── spapi.js             # Integracao SP-API (OAuth + pricing + preco)
├── vercel.json                   # Rewrites para SPA + API
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Stack Tecnologica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4 |
| UI | shadcn/ui (base-ui), Lucide Icons, Recharts, Sonner |
| State | React Query (TanStack Query v5) |
| Routing | React Router DOM v7 |
| Backend | Vercel Serverless Functions (JavaScript ESM) |
| Database | Supabase (PostgreSQL + Row Level Security) |
| API Externa | Amazon SP-API (Selling Partner API) |
| Deploy | Vercel |

## Banco de Dados (Supabase)

### Tabela `products`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID unico |
| asin | text (UNIQUE) | ASIN do produto na Amazon |
| name | text | Nome do produto |
| main_category | text | Categoria principal (atualizada pela SP-API) |
| sub_category | text | Subcategoria (atualizada pela SP-API) |
| created_at | timestamptz | Data de criacao |

### Tabela `bsr_history`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID unico |
| asin | text (FK -> products.asin) | ASIN do produto |
| main_rank | integer | Ranking principal |
| sub_rank | integer | Ranking na subcategoria (0 = sem rank/stockout) |
| price | numeric | Preco Buy Box em BRL (nullable) |
| recorded_at | timestamptz | Momento da leitura |

### Tabela `alerts`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID unico |
| asin | text (FK -> products.asin) | ASIN do produto |
| product_name | text | Nome do produto |
| rank_before | integer | Rank anterior |
| rank_after | integer | Rank atual |
| variation_pct | numeric(8,2) | Variacao percentual |
| direction | text ('up'/'down') | up = melhorou, down = piorou |
| insight | text | Sugestao de acao |
| created_at | timestamptz | Data do alerta |

### SQL para criar as tabelas

```sql
-- products (criar primeiro)
CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asin          text UNIQUE NOT NULL,
  name          text NOT NULL,
  main_category text DEFAULT '',
  sub_category  text DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select" ON products FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update" ON products FOR UPDATE USING (true);
CREATE POLICY "allow_delete" ON products FOR DELETE USING (true);

-- bsr_history
CREATE TABLE bsr_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asin          text NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  main_rank     integer NOT NULL,
  sub_rank      integer NOT NULL DEFAULT 0,
  price         numeric,
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bsr_history_asin_recorded_at_idx
  ON bsr_history (asin, recorded_at DESC);

ALTER TABLE bsr_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select" ON bsr_history FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON bsr_history FOR INSERT WITH CHECK (true);

-- alerts
CREATE TABLE alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asin          text NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  product_name  text NOT NULL,
  rank_before   integer NOT NULL,
  rank_after    integer NOT NULL,
  variation_pct numeric(8,2) NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('up', 'down')),
  insight       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select" ON alerts FOR SELECT USING (true);
CREATE POLICY "allow_insert" ON alerts FOR INSERT WITH CHECK (true);
```

## Variaveis de Ambiente

### Frontend (prefixo VITE_)

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxx
```

### Backend (Vercel Environment Variables)

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_xxxxx
SP_API_CLIENT_ID=amzn1.application-oa2-client.xxxxx
SP_API_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
SP_API_REFRESH_TOKEN=Atzr|xxxxx
SP_API_MARKETPLACE_ID=A2Q3Y263D00KWC
```

**Importante:**
- O frontend usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (anon key, segura para client-side)
- As serverless functions usam `SUPABASE_SERVICE_KEY` (service role, nunca expor no client)
- As variaveis SP_API sao usadas exclusivamente nas serverless functions

## Integracao SP-API

### Endpoint utilizado

```
GET /products/pricing/v0/items/{asin}/offers?MarketplaceId=A2Q3Y263D00KWC&ItemCondition=New
```

### Autenticacao

1. Troca `refresh_token` por `access_token` via `POST https://api.amazon.com/auth/o2/token`
2. Passa o `access_token` no header `x-amz-access-token`
3. Header adicional: `x-amz-user-agent: python-requests/2.27.1`
4. **NAO requer AWS SigV4** (apps privados com interface nova da Amazon)

### Parsing do Response

```
payload.Summary.SalesRankings[0].Rank              -> rankMain (categoria principal)
payload.Summary.SalesRankings[1].Rank              -> rankSub (subcategoria)
payload.Summary.SalesRankings[0].ProductCategoryId -> category
payload.Summary.SalesRankings[1].ProductCategoryId -> subcategory
payload.Summary.BuyBoxPrices[0].LandedPrice.Amount -> price (BRL)
```

## API Endpoints

### `GET /api/collect-bsr`

Coleta o BSR e preco de todos os ASINs cadastrados. Fluxo:

1. Busca todos os produtos da tabela `products`
2. Para cada ASIN:
   - Chama `getBSR(asin)` via SP-API (retorna BSR + preco Buy Box)
   - Retry automatico em caso de 429: espera 10s, tenta de novo; se 429 de novo, espera 15s e tenta ultima vez
   - Atualiza categorias na tabela `products`
   - Busca ultima leitura em `bsr_history`
   - Salva nova leitura (incluindo preco)
   - Calcula variacao e gera insight
   - Salva alerta em `alerts`
3. Delay de 3s entre cada ASIN para evitar rate limit
4. Retorna JSON com resumo: `{ total, success, failed, results, errors }`

**Cron job:** configure no Supabase (pg_cron) ou via cron externo para chamar este endpoint periodicamente. Exemplo com cron a cada 6 horas:

```sql
-- No Supabase SQL Editor (requer extensao pg_cron habilitada)
SELECT cron.schedule(
  'collect-bsr',
  '0 */6 * * *',
  $$SELECT net.http_get('https://seu-projeto.vercel.app/api/collect-bsr')$$
);
```

Ou via cron externo (cron-job.org, GitHub Actions, etc.):
```
0 */6 * * * curl -s https://seu-projeto.vercel.app/api/collect-bsr
```

### `GET /api/products`

Retorna todos os produtos com historico BSR (join com `bsr_history`).

### `GET /api/test-auth`

Endpoint de diagnostico: testa apenas o OAuth (refresh token -> access token).

### `GET /api/test-spapi`

Endpoint de diagnostico: chama `/sellers/v1/marketplaceParticipations` para testar conectividade com a SP-API.

## Frontend - Paginas

### Dashboard (`/`)

- Cards de produtos com BSR da subcategoria em destaque
- Badge de tendencia: Subindo / Caindo / Estavel (baseado em comparacao de 3 dias)
- Badge "Sem rank" para produtos com BSR = 0 (stockout)
- Alerta visual em cards com variacao > 30% (borda verde/vermelha + icone)
- Busca por nome ou ASIN
- Ordenacao: mais recente, melhor BSR, maior/menor variacao, maior/menor preco
- Modal para adicionar ASIN (com validacao de formato e duplicata)
- Modal de edicao de nome e remocao com confirmacao

### Detalhe do Produto (`/products/:asin`)

- Grafico unificado (3 linhas): BSR Principal (eixo esq.), BSR Subcategoria (eixo dir.), Preco Buy Box
- Filtro de periodo: 7d, 14d, 30d, Tudo (afeta grafico e tabela)
- Tabela de leituras recentes com BSR Principal, Sub, Preco e variacao
- Exportacao de historico em CSV
- Card "Insight Atual" com sugestao de acao
- Card "Resumo do Produto": categoria, subcategoria, data de monitoramento, BSR medio 7d vs 7d anteriores
- Card "Historico de Preco": preco atual, menor e maior preco registrado com datas
- Card "Analise Preco x BSR": agrupa leituras por faixa de preco (R$ 5), mostra BSR medio e quantidade de leituras por faixa, destaca a melhor faixa em verde

### Alertas (`/alerts`)

- Tabela com todos os alertas gerados automaticamente
- Colunas: produto, data, BSR antes/depois, variacao %, insight
- Link para detalhe do produto

### Comparacao (`/compare`)

- Selecao de ate 3 produtos via dropdown
- Grafico de linhas com BSR subcategoria de cada produto (cores distintas, eixo Y invertido)
- Filtro de periodo: 7d, 14d, 30d, Tudo
- Tabela comparativa: BSR atual, BSR medio 7d, variacao 7d, menor preco registrado

## Deploy (Vercel)

### vercel.json

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- Rotas `/api/*` sao tratadas como serverless functions automaticamente
- Todas as outras rotas redirecionam para `index.html` (SPA)

### Serverless Functions

- Arquivos em `api/` sao JavaScript puro (`.js`) — nao requer compilacao TypeScript
- Usam ESM (`import/export`) pois `package.json` tem `"type": "module"`
- Helpers compartilhados ficam em `api/lib/` (nao sao expostos como endpoints)

## Como rodar localmente

```bash
# Instalar dependencias
npm install

# Rodar dev server (frontend)
npm run dev
# -> http://localhost:3000

# Para testar as serverless functions localmente:
npx vercel dev
```

## Logica de Insights

| Condicao | Insight |
|----------|---------|
| rank atual > anterior (piorou) | "Ranking caiu — considere reduzir o preco para recuperar posicao" |
| rank atual < anterior (melhorou) | "Ranking melhorou — avalie aumentar o preco ou reduzir desconto" |
| rank igual | "Ranking estavel — continue monitorando" |

### Calculo de variacao

```
variation_pct = ((rankAtual - rankAnterior) / rankAnterior) * 100
```

- Valor positivo = ranking piorou (numero maior)
- Valor negativo = ranking melhorou (numero menor)

### Direcao

- `direction: 'up'` = ranking melhorou (numero menor = posicao melhor)
- `direction: 'down'` = ranking piorou (numero maior = posicao pior)

### Tratamento de stockout

- Produtos com `sub_rank = 0` recebem badge "Sem rank" no dashboard
- Alertas visuais de variacao > 30% sao ignorados quando BSR atual ou anterior e 0
- Calculos de media de BSR excluem leituras com `sub_rank = 0`

## Rate Limiting SP-API

A Amazon impoe quotas no endpoint de pricing. Estrategia implementada:

- **Delay entre ASINs:** 3 segundos fixos
- **Retry em 429:** ate 3 tentativas por ASIN
  - 1a falha: espera 10s
  - 2a falha: espera 15s
  - 3a falha: registra erro e segue para o proximo
- **Timeout Vercel:** funcoes serverless tem limite de 60s no plano Hobby. Para muitos ASINs, considere o plano Pro (300s) ou dividir em batches.

## Decisoes Tecnicas

1. **Foreign key por `asin` (nao UUID):** as tabelas `bsr_history` e `alerts` referenciam `products.asin` diretamente, simplificando queries e o join do Supabase.

2. **JavaScript puro nas serverless functions:** TypeScript nas funcoes da pasta `api/` causava erros de compilacao na Vercel. Convertido para `.js` para funcionamento imediato sem configuracao de build.

3. **Endpoint de pricing ao inves de catalog:** o endpoint `/catalog/2022-04-01/items/{asin}?includedData=salesRanks` retornava 403. O endpoint `/products/pricing/v0/items/{asin}/offers` funciona corretamente e retorna `SalesRankings` e `BuyBoxPrices` no payload.

4. **Sem AWS SigV4:** apps privados com a interface nova da Amazon nao exigem assinatura SigV4. Apenas o header `x-amz-access-token` e necessario.

5. **RLS com politicas abertas:** as tabelas usam Row Level Security com `USING (true)` para SELECT/INSERT/UPDATE/DELETE, permitindo acesso tanto pela anon key (frontend) quanto pela service key (backend).

6. **Modo escuro via classe CSS:** usa `@custom-variant dark (&:is(.dark *))` do Tailwind 4, com toggle no header e persistencia no `localStorage`. Cores dos graficos Recharts sao dinamicas via hook `useIsDark` que observa a classe `.dark` no `<html>`.

7. **Mapeamento de categorias:** IDs tecnicos da Amazon (ex: `16364844011`) sao traduzidos para nomes em portugues via `categoryMap.ts`. Categorias nao mapeadas exibem o ID original como fallback.
