# 🏥 FarmaTech Padronizador

## Objetivo

Criar uma ferramenta simples, rápida e eficiente para padronizar produtos farmacêuticos a partir do EAN.

A prioridade é colocar o sistema em operação o mais rápido possível.

---

# MVP 1.0

## Estrutura

- [x] React + Vite
- [x] GitHub
- [x] Estrutura inicial

---

## Interface

- [ ] Tela principal
- [ ] Importar XLSX
- [ ] Busca por EAN
- [ ] Tabela de produtos
- [ ] Exportar XLSX

---

## Banco

- [ ] SQLite
- [ ] Consulta por EAN
- [ ] Cadastro automático

---

## Pesquisa

- [ ] Buscar produto quando não existir
- [ ] Salvar no banco

---

# Versão 1.1

- [x] Busca de imagens (Cosmos API, com fallback manual quando não encontra)
- [x] Proxy pra resolver CORS da Cosmos (Cloudflare Worker, ver `cosmos-proxy/`) - testado e funcionando com busca automática real

> Google Custom Search foi avaliado e descartado: fechado para novos clientes desde 2025 e será desligado em 01/01/2027. Mercado Livre também foi avaliado - o endpoint público de busca está instável/bloqueado (relatos recentes de 403 mesmo com token válido). Bing Image Search API foi descontinuada pela Microsoft. Cosmos segue como única fonte automática viável hoje.
- [x] Armazenamento local de imagens (IndexedDB, por EAN)

### Armazenamento de imagens — capacidade

As imagens baixadas são salvas no **IndexedDB do navegador** (não em um servidor). Isso significa:

- Não existe um limite fixo de quantidade de imagens — o limite real é o **espaço em disco livre** da máquina, não um número de arquivos.
- Estimativa pro catálogo atual (~5.000 produtos): fotos comprimidas de produto costumam pesar 50–300KB cada, então o total fica entre ~250MB e ~1,5GB — tranquilo pra qualquer computador com espaço livre normal.
- **Chrome, Edge e Firefox**: aceitam vários GB por site, sem problema mesmo crescendo bem além dos 5.000 produtos.
- **Safari**: mais restritivo, pode apagar dados automaticamente após um tempo de inatividade (proteção anti-rastreamento). Recomendado evitar Safari pra essa ferramenta.
- Como é armazenamento local do navegador, o cache **não é compartilhado entre máquinas/pessoas** — cada computador baixa e guarda sua própria cópia. Se no futuro for necessário compartilhar entre o time, isso exige migrar para um banco com backend (ver seção "Banco" abaixo).

---

# Versão 1.2

- [ ] IA Padronizadora

---

# Versão 2.0

- [ ] Dashboard
- [ ] Relatórios
- [ ] Login
- [ ] Multiempresa
- [ ] API

---

## Ideia futura: rede de lojas (múltiplas filiais)

Discutido em 2026-10 - não implementado ainda, fica registrado pra
quando for a hora.

Cenário: uma rede com várias farmácias, todas no mesmo banco Firebird
(multi-filial, como o Farmax já suporta - colunas `ESTOQUE_N` /
`PRECO_VENDA_N` por filial), com catálogo e preço unificados pro
cliente (ele não escolhe loja, o pedido é atendido por quem tiver
estoque).

Duas peças, independentes mas complementares:

1. **Extração somando as filiais** - `firebird-extrator/extrair.js`
   passa a aceitar uma lista de filiais (`FB_FILIAIS=1,2,3,4` em vez
   de `FB_FILIAL` único), soma o estoque das colunas de cada uma numa
   consulta só, e usa o preço de uma filial de referência (assumindo
   preço padronizado na rede). Resto da estrutura (imagens-proxy,
   publish-proxy, padronizador, painel, site) não muda - continua
   "um catálogo, um preço, um estoque por produto", só que agora esse
   estoque é a soma das lojas.

2. **CEP → loja mais próxima, no site** - o site já tem toda a
   mecânica de frete pronta (ViaCEP + geocodificação via
   Nominatim/OpenStreetMap + cálculo de distância, hoje comparando
   com uma loja só via `LOJA_LAT`/`LOJA_LNG` fixos em `script.js`).
   Pra várias lojas, troca por uma lista de lojas (coordenadas de
   cada uma) e calcula a distância até todas, usando a mais próxima
   pro frete. Decisão em aberto: se isso também deve aparecer pro
   cliente (tipo "você será atendido pela unidade Centro") e/ou ir
   junto no pedido pro painel, pra quem for separar já saber de qual
   loja puxar o estoque.