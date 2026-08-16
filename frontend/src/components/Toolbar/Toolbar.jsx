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
    total,
    limparFiltros,
    produtos,
    produtosCompletos,
    mostrarToast
}) {

    const [publicando, setPublicando] = useState(false);
    const [substituirTudo, setSubstituirTudo] = useState(false);

    async function handlePublicar() {

        setPublicando(true);

        try {

            // Sempre publica o catálogo completo importado, nunca a lista
            // filtrada da tela - senão um filtro ativo (categoria, busca...)
            // apagaria do site tudo que não bate com o filtro.
            const modo = substituirTudo ? "substituir" : "mesclar";

            const { total: totalPublicado, enviados } = await publicarNoSite(produtosCompletos || produtos, modo);

            mostrarToast?.(

                modo === "mesclar"
                    ? `${enviados} produto(s) atualizado(s) - catálogo no site ficou com ${totalPublicado} produtos.`
                    : `Catálogo substituído: ${totalPublicado} produtos publicados no site.`,

                "sucesso"

            );

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

                <label className="toolbar-modo-publicacao" title="Marque só quando importar o catálogo completo e quiser que produtos ausentes desta planilha saiam do site (ex: descontinuados). Deixe desmarcado pra atualizar/acrescentar sem apagar o resto.">
                    <input
                        type="checkbox"
                        checked={substituirTudo}
                        onChange={(e) => setSubstituirTudo(e.target.checked)}
                    />
                    Substituir tudo (apaga do site quem não estiver aqui)
                </label>

                <button
                    className="btn btn-primary"
                    onClick={handlePublicar}
                    disabled={publicando}
                    title={
                        substituirTudo
                            ? `Substitui o catálogo inteiro do site por estes ${(produtosCompletos || produtos).length} produtos, ignorando filtros ativos na tela`
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
