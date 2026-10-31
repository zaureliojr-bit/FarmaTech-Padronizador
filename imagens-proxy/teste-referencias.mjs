/* As listas de referência guardadas aqui, e a trava de nome.

   ESTE ARQUIVO NASCEU DE UM DEFEITO MEU. A tela de "nomes dos
   subfiltros" do painel foi escrita gravando em
   /referencias/subcategorias, e eu testei o salvar com o servidor
   simulado — respondendo 200 a qualquer coisa. Em produção a resposta
   era 400: a rota tem uma lista FECHADA de nomes aceitos, e
   "subcategorias" não estava nela. A tela inteira não salvava nada, e
   o site não lia nada.

   A lista fechada está certa e continua: a rota divide a IMAGENS_KEY
   com as outras, então travar o nome é o que limita o estrago de uma
   chave vazada. O que faltava era o nome novo entrar nela.

   O que este arquivo guarda:

     1. cada nome que algum cliente de verdade usa hoje aceita gravar e
        devolve o que foi gravado — se alguém estreitar a lista, cai
        aqui e não na loja;
     2. um nome fora da lista continua recusado, que é a razão de a
        lista existir;
     3. ler é público e gravar não é. O site lê o dicionário sem chave
        nenhuma; se um dia a leitura passar a exigir chave, a barra de
        subcategoria do site inteiro para de funcionar em silêncio.

   Uso: node teste-referencias.mjs
*/

import worker from "./worker.js";

let falhas = 0;
const ok = (m) => console.log("   ✓", m);
const nao = (m, d = "") => { falhas++; console.log("   ✗", m, d ? "→ " + d : ""); };
const conferir = (m, cond, d) => (cond ? ok(m) : nao(m, d));

const CHAVE = "chave-de-teste";
const base = "https://i.exemplo.dev";

function fazerBucket() {
  const arq = new Map();
  return {
    _arq: arq,
    async put(k, v, o) { arq.set(k, { bytes: v, o }); },
    async get(k) {
      const a = arq.get(k);
      if (!a) return null;
      return {
        body: a.bytes,
        httpMetadata: a.o?.httpMetadata,
        async json() { return JSON.parse(new TextDecoder().decode(a.bytes)); },
        async text() { return new TextDecoder().decode(a.bytes); },
        async arrayBuffer() { return a.bytes; }
      };
    },
    async delete(k) { arq.delete(k); }
  };
}

function fazerDB() {
  return {
    prepare() {
      const self = {
        bind: () => self,
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true }; }
      };
      return self;
    }
  };
}

/* O binding do R2 se chama IMAGENS_BUCKET no worker. */
const env = { IMAGENS_BUCKET: fazerBucket(), DB: fazerDB(), IMAGENS_KEY: CHAVE };

const gravar = (nome, corpo, chave = CHAVE) =>
  worker.fetch(new Request(`${base}/referencias/${nome}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Imagens-Key": chave },
    body: JSON.stringify(corpo)
  }), env);

const ler = (nome) =>
  worker.fetch(new Request(`${base}/referencias/${nome}`), env);

/* ---- 1. os nomes que têm cliente de verdade -------------------------- */
console.log("\n1. cada lista que alguém usa hoje grava e volta");

/* Quem escreve cada um, para quem mexer na lista saber o que quebra:

     cmed                 padronizador, planilha da CMED
     distribuidor         padronizador, lista da DPCNET
     grupo-farmacologico  padronizador, classificação do MyMedFarma
     subcategorias        painel da loja, aba Catálogo
*/
for (const [nome, conteudo] of [
  ["cmed", { versao: 1, porEan: { "7891234567895": 1 } }],
  ["distribuidor", { versao: 1, totalLinhas: 2 }],
  ["grupo-farmacologico", { versao: 1, porEan: { "7891234567895": "A02B" } }],
  ["subcategorias", { versao: 1, rotulos: { "varejo": { oculto: true } } }]
]) {

  const resposta = await gravar(nome, conteudo);
  conferir(`"${nome}" aceita gravar`, resposta.status === 200,
    `${resposta.status} ${await resposta.text().catch(() => "")}`);

  const volta = await ler(nome);
  conferir(`"${nome}" devolve o que foi gravado`, volta.status === 200,
    String(volta.status));

  if (volta.status === 200) {
    const dados = await volta.json().catch(() => null);
    conferir(`"${nome}" volta igual`,
      JSON.stringify(dados) === JSON.stringify(conteudo),
      JSON.stringify(dados));
  }
}

/* ---- 2. a trava continua travando ------------------------------------ */
console.log("\n2. nome fora da lista continua recusado");
{
  /* A razão de a lista existir: esta rota divide a IMAGENS_KEY com as
     de imagem e extração. Sem a trava, uma chave vazada vira um balde
     de qualquer coisa dentro do R2 da farmácia. */
  const resposta = await gravar("qualquer-coisa", { a: 1 });
  conferir("grava recusa nome desconhecido", resposta.status === 400,
    String(resposta.status));

  const lida = await ler("qualquer-coisa");
  conferir("e ler também", lida.status === 400, String(lida.status));
}

/* ---- 3. ler é público, gravar não é ---------------------------------- */
console.log("\n3. o site lê sem chave; só quem tem a chave grava");
{
  /* O site busca o dicionário de subcategorias direto daqui, sem chave
     nenhuma. Se a leitura passar a exigir chave, a barra do site
     inteiro volta aos nomes crus — em silêncio, porque o código trata
     a falha como "ainda não tem dicionário". */
  const semChave = await ler("subcategorias");
  conferir("ler não pede chave", semChave.status === 200, String(semChave.status));

  const comChaveErrada = await gravar("subcategorias", { versao: 1 }, "chave-errada");
  conferir("gravar com chave errada é 401",
    comChaveErrada.status === 401, String(comChaveErrada.status));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
