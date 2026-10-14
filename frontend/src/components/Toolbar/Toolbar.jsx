import { useState } from "react";
import "./Toolbar.css";
import { exportarJSON } from "../../services/exportService";
import { publicarNoSite } from "../../services/exportSiteService";

function Toolbar({
    pesquisa,
    setPesquisa,
    laboratorios,
    categorias,
    classes,
    abas,
    laboratorio,
    setLaboratorio,
    categoria,
    setCategoria,
    classe,
    setClasse,
    aba,
    setAba,
    filtroImagem,
    setFiltroImagem,
    total,
    limparFiltros,
    produtos,
    produtosCompletos,
    mostrarToast
}) {

    const [publicando, setPublicando] = useState(false);

    // "mesclar" (padrão): atualiza/acrescenta, sem mexer em quem não veio.
    // "encomenda": pra planilha só dos itens com estoque - quem não veio
    // fica marcado sem estoque/pra encomendar, sem sumir do site.
    // "substituir": apaga do site quem não estiver nesta planilha.
    const [modoPublicacao, setModoPublicacao] = useState("mesclar");

    async function handlePublicar() {

        setPublicando(true);

        try {

            // Sempre publica o catálogo completo importado, nunca a lista
            // filtrada da tela - senão um filtro ativo (categoria, busca...)
            // apagaria do site tudo que não bate com o filtro.
            const { total: totalPublicado, enviados } = await publicarNoSite(produtosCompletos || produtos, modoPublicacao);

            const mensagens = {
                mesclar: `${enviados} produto(s) atualizado(s) - catálogo no site ficou com ${totalPublicado} produtos.`,
                encomenda: `${enviados} produto(s) atualizado(s) - quem não veio nesta planilha ficou marcado sem estoque/pra encomenda.`,
                substituir: `Catálogo substituído: ${totalPublicado} produtos publicados no site.`
            };

            mostrarToast?.(mensagens[modoPublicacao], "sucesso");

        } catch (erro) {

            console.error("Erro ao publicar no site", erro);
            mostrarToast?.(erro.message || "Erro ao publicar no site.", "erro");

        } finally {

            setPublicando(false);

        }

    }

    return (

        <div className="toolbar">

            <div className="toolbar-filtros">

                <input
                    className="toolbar-busca"
                    type="text"
                    placeholder="🔎 Pesquisar por nome, marca, EAN..."
                    value={pesquisa}
                    onChange={(e) => setPesquisa(e.target.value)}
                />

                <select
                    value={laboratorio}
                    onChange={(e) => setLaboratorio(e.target.value)}
                >
                    <option value="">Todos os Laboratórios</option>

                    {laboratorios.map(item => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}

                </select>

                <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                >
                    <option value="">Todas as Categorias</option>

                    {categorias.map(item => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}

                </select>

                <select
                    value={classe}
                    onChange={(e) => setClasse(e.target.value)}
                >
                    <option value="">Todas as Classes</option>

                    {classes.map(item => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}

                </select>

                <select
                    value={aba}
                    onChange={(e) => setAba(e.target.value)}
                >
                    <option value="">Todas as Abas</option>

                    {abas.map(item => (
                        <option key={item} value={item}>
                            {item}
                        </option>
                    ))}

                </select>

                <select
                    value={filtroImagem}
                    onChange={(e) => setFiltroImagem(e.target.value)}
                >
                    <option value="">Todos (com ou sem imagem)</option>
                    <option value="sem">Só sem imagem</option>
                    <option value="com">Só com imagem</option>
                </select>

                <button className="btn btn-ghost" onClick={limparFiltros}>
                    Limpar
                </button>

            </div>

            <div className="toolbar-acoes">

                <div className="toolbar-contagem">
                    <strong>{total.toLocaleString("pt-BR")}</strong> produtos
                </div>

                <button
                    className="btn btn-outline"
                    onClick={() => exportarJSON(produtos)}
                >
                    📤 Exportar JSON
                </button>

                <select
                    className="toolbar-modo-publicacao"
                    value={modoPublicacao}
                    onChange={(e) => setModoPublicacao(e.target.value)}
                    title="Como tratar, no site, os produtos que não vierem nesta planilha"
                >
                    <option value="mesclar">Mesclar (mantém quem não veio do jeito que estava)</option>
                    <option value="encomenda">Mesclar e marcar sem estoque quem não veio (planilha só do que tem estoque)</option>
                    <option value="substituir">Substituir tudo (apaga do site quem não estiver aqui)</option>
                </select>

                <button
                    className="btn btn-primary"
                    onClick={handlePublicar}
                    disabled={publicando}
                    title={
                        modoPublicacao === "substituir"
                            ? `Substitui o catálogo inteiro do site por estes ${(produtosCompletos || produtos).length} produtos, ignorando filtros ativos na tela`
                            : modoPublicacao === "encomenda"
                                ? `Atualiza estes ${(produtosCompletos || produtos).length} produtos e marca sem estoque/pra encomenda quem já estava publicado mas não veio nesta planilha`
                                : `Atualiza/acrescenta estes ${(produtosCompletos || produtos).length} produtos no site, sem apagar o que já estava publicado`
                    }
                >
                    {publicando ? "Publicando..." : "🌐 Publicar no site"}
                </button>

            </div>

        </div>

    );

}

export default Toolbar;
