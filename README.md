# BSR Tracker

Sistema de monitoramento de Best Seller Rank (BSR) da Amazon para o marketplace Brasil (A2Q3Y263D00KWC). Permite rastrear a posicao dos seus produtos no ranking, registrar historico, calcular variacoes e gerar insights automaticos de precificacao.

## Arquitetura

```
bsrtracker/
├── src/                          # Frontend React (Vite)
│   ├── pages/
│   │   ├── Dashboard.tsx         # Lista de produtos com BSR atual
│   │   ├── ProductDetail.tsx     # Detalhe + grafico historico
│   │   └── Alerts.tsx            # Tabela de alertas gerados
│   ├── components/
│   │   ├── Layout.tsx            # Layout principal (header, nav, footer)
│   │   └── ui/                   # Componentes shadcn/ui
│   ├── lib/
│   │   ├── supabase.ts          # Cliente Supabase (anon key, frontend)
│   │   ├── insights.ts          # Logica de insight e calculo de variacao
│   │   └── utils.ts             # Utilidade cn() para classnames
│   ├── App.tsx                   # Router (3 rotas)
│   └── main.tsx                  # Entry point React
├── api/                          # Serverless functions (Vercel)
│   ├── collect-bsr.js           # Coleta BSR de todos os ASINs
│   ├── products.js              # GET produtos com BSR mais recente
│   ├── test-auth.js             # Diagnostico: testa OAuth SP-API
│   ├── test-spapi.js            # Diagnostico: testa conectividade SP-API
│   └── lib/
│       └── spapi.js             # Integracao SP-API (OAuth + pricing)
├── vercel.json                   # Rewrites para SPA + API
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Stack Tecnologica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4 |
| UI | shadcn/ui, Lucide Icons, Recharts, Sonner |
| State | React Query (TanStack Query v5) |
| Backend | Vercel Serverless Functions (JavaScript puro) |
| Database | Supabase (PostgreSQL) |
| API Externa | Amazon SP-API (Selling Partner API) |
| Deploy | Vercel |

## Banco de Dados (Supabase)

### Tabela `products`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID unico |
| asin | text (UNIQUE) | ASIN do produto na Amazon |
| name | text | Nome do produto |
| main_category | text | Categoria principal |
| sub_category | text | Subcategoria |
| created_at | timestamptz | Data de criacao |

### Tabela `bsr_history`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID unico |
| asin | text (FK -> products.asin) | ASIN do produto |
| main_rank | integer | Ranking principal |
| sub_rank | integer | Ranking na subcategoria |
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

-- bsr_history
CREATE TABLE bsr_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asin          text NOT NULL REFERENCES products(asin) ON DELETE CASCADE,
  main_rank     integer NOT NULL,
  sub_rank      integer NOT NULL DEFAULT 0,
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
payload.Summary.SalesRankings[0].Rank      -> rankMain (categoria principal)
payload.Summary.SalesRankings[1].Rank      -> rankSub (subcategoria)
payload.Summary.SalesRankings[0].ProductCategoryId -> category
payload.Summary.SalesRankings[1].ProductCategoryId -> subcategory
```

## API Endpoints

### `GET /api/collect-bsr`

Coleta o BSR de todos os ASINs cadastrados. Fluxo:

1. Busca todos os produtos da tabela `products`
2. Para cada ASIN:
   - Chama `getBSR(asin)` via SP-API
   - Retry automatico em caso de 429: espera 10s, tenta de novo; se 429 de novo, espera 15s e tenta ultima vez
   - Busca ultima leitura em `bsr_history`
   - Salva nova leitura
   - Calcula variacao e gera insight
   - Salva alerta em `alerts`
3. Delay de 3s entre cada ASIN para evitar rate limit
4. Retorna JSON com resumo: `{ total, success, failed, results, errors }`

### `GET /api/products`

Retorna todos os produtos com historico BSR mais recente (join com `bsr_history`).

### `GET /api/test-auth`

Endpoint de diagnostico: testa apenas o OAuth (refresh token -> access token). Retorna preview do token e status das variaveis de ambiente.

### `GET /api/test-spapi`

Endpoint de diagnostico: chama `/sellers/v1/marketplaceParticipations` para testar conectividade com a SP-API.

## Frontend - Paginas

### Dashboard (`/`)

- Lista todos os produtos cadastrados em cards
- Mostra BSR principal, variacao percentual, rank na subcategoria
- Insight do dia (baseado na variacao mais recente)
- Dialog para adicionar novo ASIN
- Ordena bsr_history por `recorded_at` desc para exibir o mais recente

### Detalhe do Produto (`/products/:asin`)

- Grafico de linha (Recharts) com historico de BSR (main + sub)
- Tabela de leituras recentes com variacao
- Card de insight atual
- Resumo: categoria, subcategoria, data de inicio do monitoramento

### Alertas (`/alerts`)

- Tabela com todos os alertas gerados
- Colunas: produto, data, BSR antes/depois, variacao %, insight
- Link para detalhe do produto

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

3. **Endpoint de pricing ao inves de catalog:** o endpoint `/catalog/2022-04-01/items/{asin}?includedData=salesRanks` retornava 403. O endpoint `/products/pricing/v0/items/{asin}/offers` funciona corretamente e retorna `SalesRankings` no payload.

4. **Sem AWS SigV4:** apps privados com a interface nova da Amazon nao exigem assinatura SigV4. Apenas o header `x-amz-access-token` e necessario.

5. **RLS com politicas abertas:** as tabelas usam Row Level Security com `USING (true)` para SELECT/INSERT, permitindo acesso tanto pela anon key (frontend) quanto pela service key (backend).
