const fs = require("node:fs");
const cheerio = require("cheerio");
const XLSX = require("xlsx");
const robotsParser = require("robots-parser");

const ORIGEM = "https://loja.solfarma.com.br";
const SITEMAP = ORIGEM + "/sitemap.xml";
const AGENTE = "DrogaLinkCatalogo/1.0";
const limite = Number(process.env.LIMITE || 0);
if (!Number.isInteger(limite) || limite < 0) throw new Error("LIMITE inválido");
const sufixo = limite ? "_teste" : "";
const checkpoint = "solfarma" + sufixo + ".jsonl";
const saida = "distribuidora_solfarma" + sufixo + ".xlsx";
const registros = new Map();
let robots;
let intervalo = 2000;
const pausa = ms => new Promise(resolve => setTimeout(resolve, ms));
const limpo = s => String(s || "").replace(/\s+/g, " ").trim();
const normal = s => limpo(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function obter(url, verificar = true) {
  if (verificar && robots.isAllowed(url, AGENTE) === false) throw new Error("A coleta não é permitida pelo robots.txt: " + url);
  const r = await fetch(url, {
    headers: { "User-Agent": AGENTE },
    redirect: "manual",
    signal: AbortSignal.timeout(30000)
  });
  if (r.status === 403 || r.status === 401 || r.status === 429 || (r.status >= 300 && r.status < 400)) {
    throw new Error("Acesso restrito ou redirecionamento (HTTP " + r.status + "). Extração interrompida.");
  }
  return r;
}

function produtoUrl(valor) {
  try {
    const url = new URL(valor);
    if (url.origin !== ORIGEM || !/^\/produto-detalhe\/\d+$/.test(url.pathname)) return null;
    return ORIGEM + url.pathname;
  } catch { return null; }
}

function extrairProduto(html, url) {
  const $ = cheerio.load(html);
  const nome = limpo($("h1").first().text());
  const campos = new Map();
  const etiquetas = ["marca", "fabricante", "categoria", "subcategoria", "codigo de barras", "codigo do produto", "linha do produto"];
  $("body *").each((_, el) => {
    const rotulo = normal($(el).text());
    if (!etiquetas.includes(rotulo) || campos.has(rotulo)) return;
    // Nos detalhes, a etiqueta e o valor podem ser irmãos ou estar em um contêiner comum.
    let atual = $(el);
    for (let nivel = 0; nivel < 3; nivel++) {
      const vizinho = atual.next();
      const valor = limpo(vizinho.text());
      if (valor && valor.length <= 250 && !etiquetas.includes(normal(valor))) {
        campos.set(rotulo, valor);
        break;
      }
      atual = atual.parent();
    }
  });
  const ean = (campos.get("codigo de barras") || "").replace(/\s/g, "");
  if (!nome || !/^\d{8,14}$/.test(ean)) return null;
  const codigo = url.split("/").at(-1);
  const informado = campos.get("codigo do produto");
  if (informado && informado !== codigo && Number(informado) !== Number(codigo)) return null;
  let imagem = "";
  $("img").each((_, el) => {
    if (imagem) return;
    try {
      const img = new URL($(el).attr("src") || "", ORIGEM);
      if (img.protocol !== "https:" || img.hostname !== "arquivos.solfarma.com.br" ||
          !img.pathname.startsWith("/loja/imagens/produto/grande/")) return;
      const arquivo = img.pathname.split("/").at(-1);
      const id = arquivo.match(/^(\d+)_000\.(?:png|jpe?g|webp)$/i);
      if (id && Number(id[1]) === Number(codigo)) imagem = img.href;
    } catch {}
  });
  return {
    "Código": codigo, EAN: ean, "Descrição": nome, Imagem: imagem,
    Marca: campos.get("marca") || "", "Laboratório": campos.get("fabricante") || "",
    Categoria: campos.get("categoria") || "", Subcategoria: campos.get("subcategoria") || ""
  };
}

function exportar() {
  if (!registros.size) return;
  const unicos = new Map();
  for (const p of registros.values()) {
    const antigo = unicos.get(p.EAN);
    if (!antigo || (!antigo.Imagem && p.Imagem)) unicos.set(p.EAN, p);
  }
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet([...unicos.values()]), "Solfarma");
  XLSX.writeFile(livro, saida);
  console.log("Planilha atualizada:", saida, "-", unicos.size, "EANs únicos.");
}

async function main() {
  if (fs.existsSync(checkpoint)) {
    for (const linha of fs.readFileSync(checkpoint, "utf8").split("\n")) {
      if (!linha.trim()) continue;
      try { const item = JSON.parse(linha); registros.set(item.url, item.produto); } catch {}
    }
  }
  const robotUrl = ORIGEM + "/robots.txt";
  const rr = await obter(robotUrl, false);
  if (!rr.ok && rr.status !== 404) throw new Error("Não consegui verificar as regras de coleta do site.");
  robots = robotsParser(robotUrl, rr.ok ? await rr.text() : "");
  intervalo = Math.max(2000, (robots.getCrawlDelay(AGENTE) || 0) * 1000);
  await pausa(intervalo);
  const sitemap = await obter(SITEMAP);
  if (!sitemap.ok) throw new Error("Sitemap não disponível: HTTP " + sitemap.status);
  const xml = cheerio.load(await sitemap.text(), { xmlMode: true });
  const urls = [...new Set(xml("url > loc").map((_, el) => produtoUrl(xml(el).text().trim())).get().filter(Boolean))];
  if (!urls.length) throw new Error("Nenhuma página de produto encontrada no sitemap.");
  const fila = limite ? urls.slice(0, limite) : urls;
  console.log(urls.length, "páginas públicas; processando", fila.length, "; já extraídas:", registros.size);
  let falhasConsecutivas = 0;
  let novas = 0;
  for (const url of fila) {
    if (registros.has(url)) continue;
    await pausa(intervalo);
    const r = await obter(url);
    if (r.status === 404) { console.warn("Produto não encontrado:", url); continue; }
    if (!r.ok) throw new Error("HTTP " + r.status + " ao ler " + url);
    const produto = extrairProduto(await r.text(), url);
    if (!produto) {
      console.warn("Sem EAN ou detalhes válidos:", url);
      if (++falhasConsecutivas >= 5) throw new Error("Cinco páginas consecutivas sem dados válidos. Confira o HTML público antes de continuar.");
      continue;
    }
    falhasConsecutivas = 0;
    fs.appendFileSync(checkpoint, JSON.stringify({ url, produto }) + "\n");
    registros.set(url, produto);
    novas++;
    console.log(registros.size + "/" + fila.length, produto.EAN, produto["Descrição"], produto.Imagem ? "[foto]" : "[sem foto]");
    if (novas % 100 === 0) exportar();
  }
}
process.on("SIGINT", () => { exportar(); process.exit(130); });
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(exportar);
