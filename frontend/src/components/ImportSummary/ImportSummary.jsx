import "./ImportSummary.css";

function ImportSummary({ resumo }) {

    if (!resumo) return null;

    return (

        <div className="summary">

            <div className="card">

                <span>📄 Arquivo</span>

                <strong>{resumo.arquivo}</strong>

            </div>

            <div className="card">

                <span>📑 Abas</span>

                <strong>{resumo.totalAbas}</strong>

            </div>

            <div className="card">

                <span>📦 Produtos</span>

                <strong>{resumo.totalProdutos}</strong>

            </div>

        </div>

    );

}

export default ImportSummary;