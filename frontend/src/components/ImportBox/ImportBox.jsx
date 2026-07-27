import "./ImportBox.css";
import { importarPlanilha } from "../../services/importador";

function ImportBox({ onImportar }) {

    async function selecionarArquivo(event) {

        const arquivo = event.target.files[0];

        if (!arquivo) return;

        try {

            const resultado = await importarPlanilha(arquivo);

onImportar(resultado);

        } catch (erro) {

            console.error(erro);

        }

    }

    return (

        <div className="import-box">

            <h2>Importar Planilha</h2>

            <p>Selecione um arquivo XLSX</p>

            <input
                type="file"
                accept=".xlsx,.xls"
                onChange={selecionarArquivo}
            />

        </div>

    );

}

export default ImportBox;