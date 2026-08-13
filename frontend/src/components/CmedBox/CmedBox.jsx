import "./CmedBox.css";

const PAGINA_DA_CMED =
    "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos";

function dinheiro(valor) {

    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

}

function dataCurta(iso) {

    if (!iso) return "";

    return new Date(iso).toLocaleDateString("pt-BR");

}

function CmedBox({
    indice,
    relatorio,
    carregando,
    erro,
    carregarLista,
    corrigirClasse,
    setCorrigirClasse,
    corrigirLaboratorio,
    setCorrigirLaboratorio,
    mostrarToast
}) {

    async function selecionarArquivo(event) {

        const arquivo = event.target.files[0];

        // deixa escolher o mesmo arquivo de novo depois de um erro
        event.target.value = "";

        if (!arquivo) return;

        const resultado = await carregarLista(arquivo);

        if (resultado.sucesso) {

            mostrarToast?.(
                resultado.guardou
                    ? `Lista da CMED carregada: ${resultado.totalLinhas.toLocaleString("pt-BR")} medicamentos. Aplicada automaticamente a partir de agora.`
                    : "Lista carregada, mas não consegui guardá-la no navegador - vai precisar reimportar ao reabrir o padronizador.",
                resultado.guardou ? "sucesso" : "aviso"
            );

        } else {

            mostrarToast?.("Não consegui ler essa planilha da CMED.", "erro");

        }

    }

    return (

        <div className="cmed-box">

            <div className="cmed-cabecalho">

                <h2>🏛️ Padronização pela CMED</h2>

                {indice && (

                    <span className="cmed-fonte">
                        {indice.totalLinhas.toLocaleString("pt-BR")} medicamentos · carregada em {dataCurta(indice.importadoEm)}
                    </span>

                )}

            </div>

            {!indice && (

                <p className="cmed-ajuda">
                    A planilha do PDV não diz se um medicamento exige receita nem qual é
                    o preço máximo que a lei permite cobrar. A Lista de Conformidade da
                    CMED diz as duas coisas e casa com o cadastro pelo EAN — assim que
                    você carregar a lista, toda planilha importada daqui pra frente é
                    corrigida automaticamente, sem precisar repetir o passo. Baixe a
                    lista do mês em{" "}
                    <a href={PAGINA_DA_CMED} target="_blank" rel="noreferrer">
                        gov.br/anvisa
                    </a>.
                </p>

            )}

            <div className="cmed-acoes">

                <label className="btn btn-outline cmed-arquivo">

                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        disabled={carregando}
                        onChange={selecionarArquivo}
                    />

                    {carregando ? "Lendo..." : indice ? "Trocar a lista" : "Escolher a lista da CMED"}

                </label>

                {indice && (

                    <>

                        <label className="cmed-opcao">

                            <input
                                type="checkbox"
                                checked={corrigirClasse}
                                onChange={(e) => setCorrigirClasse(e.target.checked)}
                            />
                            Corrigir classe pela CMED

                        </label>

                        <label className="cmed-opcao">

                            <input
                                type="checkbox"
                                checked={corrigirLaboratorio}
                                onChange={(e) => setCorrigirLaboratorio(e.target.checked)}
                            />
                            Corrigir laboratório pela CMED

                        </label>

                    </>

                )}

            </div>

            {erro && <p className="cmed-erro">{erro}</p>}

            {relatorio && <Relatorio relatorio={relatorio} />}

        </div>

    );

}

function Relatorio({ relatorio }) {

    const naoEncontrados = relatorio.naoEncontrados.length;

    return (

        <div className="cmed-relatorio">

            <div className="cmed-numeros">

                <Numero
                    rotulo="Medicamentos cruzados"
                    valor={`${relatorio.encontrados.toLocaleString("pt-BR")} de ${(relatorio.medicamentos + relatorio.foraDaClasse.length).toLocaleString("pt-BR")}`}
                />

                <Numero
                    rotulo="Exigem receita"
                    valor={relatorio.exigemReceita.toLocaleString("pt-BR")}
                    tom="amarelo"
                />

                <Numero
                    rotulo="Isentos (MIP)"
                    valor={relatorio.isentos.toLocaleString("pt-BR")}
                    tom="verde"
                />

                <Numero
                    rotulo="Acima do preço máximo"
                    valor={relatorio.acimaDoPmc.length.toLocaleString("pt-BR")}
                    tom={relatorio.acimaDoPmc.length ? "vermelho" : "verde"}
                />

            </div>

            <p className="cmed-detalhe">

                Tarja preta: {relatorio.porTarja.P || 0}
                {" · "}vermelha sob restrição: {relatorio.porTarja.R || 0}
                {" · "}vermelha: {relatorio.porTarja.V || 0}
                {" · "}sem tarja: {relatorio.porTarja.L || 0}

                {relatorio.semTarja > 0 && (
                    <> {" · "}sem classificação na CMED: {relatorio.semTarja}</>
                )}

            </p>

            {relatorio.foraDaClasse.length > 0 && (

                <p className="cmed-detalhe cmed-aviso">
                    {relatorio.foraDaClasse.length} estão na CMED mas não estão
                    classificados como medicamento no cadastro — aparecem em
                    VITAMINAS, PERFUMARIA e afins.{" "}
                    {relatorio.foraDaClasse.filter((x) => x.tarja && x.tarja !== "L").length}{" "}
                    deles têm tarja e passaram a exigir receita.
                </p>

            )}

            {naoEncontrados > 0 && (

                <p className="cmed-detalhe">
                    {naoEncontrados.toLocaleString("pt-BR")} não estão na CMED — em
                    geral suplemento, homeopático e correlato, que não são
                    medicamentos de preço regulado.
                </p>

            )}

            {relatorio.acimaDoPmc.length > 0 && (

                <div className="cmed-alerta">

                    <h3>
                        {relatorio.acimaDoPmc.length} produtos acima do preço máximo ao consumidor
                    </h3>

                    <p>
                        Vender acima do PMC contraria a Lei 10.742/2003. O teto
                        usado é o de ICMS 18% (São Paulo), que é o mais alto da
                        tabela.
                    </p>

                    <div className="cmed-tabela-wrap">

                        <table>

                            <thead>
                                <tr>
                                    <th>Produto</th>
                                    <th>Preço</th>
                                    <th>Teto</th>
                                    <th>Excesso</th>
                                </tr>
                            </thead>

                            <tbody>
                                {relatorio.acimaDoPmc.slice(0, 20).map((item) => (
                                    <tr key={item.codigo}>
                                        <td>{item.descricao}</td>
                                        <td>{dinheiro(item.precoCobrado)}</td>
                                        <td>{dinheiro(item.pmc)}</td>
                                        <td className="cmed-excesso">+{item.excessoPercent}%</td>
                                    </tr>
                                ))}
                            </tbody>

                        </table>

                    </div>

                    {relatorio.acimaDoPmc.length > 20 && (
                        <p className="cmed-detalhe">
                            Mostrando os 20 maiores. Os demais estão marcados na
                            tabela de produtos.
                        </p>
                    )}

                </div>

            )}

            {relatorio.acimaDoPmcSoNaPromocao.length > 0 && (

                <p className="cmed-detalhe cmed-aviso">
                    Outros {relatorio.acimaDoPmcSoNaPromocao.length} produtos estão
                    dentro do teto só por causa da promoção — o preço de tabela
                    passa do máximo legal. Acabando a promoção, voltam a ficar
                    acima.
                </p>

            )}

            {(relatorio.classeDivergente.length > 0 ||
              relatorio.laboratorioDivergente.length > 0) && (

                <p className="cmed-detalhe">

                    Divergências em relação à CMED:{" "}
                    {relatorio.classeDivergente.length} de classe e{" "}
                    {relatorio.laboratorioDivergente.length} de laboratório.

                    {relatorio.corrigidos.classe + relatorio.corrigidos.laboratorio > 0
                        ? ` Corrigidas: ${relatorio.corrigidos.classe} classes e ${relatorio.corrigidos.laboratorio} laboratórios.`
                        : " Marque as opções acima para corrigir."}

                </p>

            )}

        </div>

    );

}

function Numero({ rotulo, valor, tom = "" }) {

    return (

        <div className={`cmed-numero ${tom ? `cmed-numero-${tom}` : ""}`}>
            <span>{rotulo}</span>
            <strong>{valor}</strong>
        </div>

    );

}

export default CmedBox;
