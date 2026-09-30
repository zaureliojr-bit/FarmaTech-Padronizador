// Segunda passada de build (ver package.json - script "build"), além
// do app normal: empacota o pipeline de importação+publicação
// (src/headless/importarEPublicar.js) num arquivo único, servido junto
// com o resto do padronizador. Outro site (ex.: o painel da loja, em
// outro domínio) carrega ele direto por essa URL:
//
//   https://<seu-dominio-do-padronizador>/importador-automatico.js
//
// Sem precisar copiar arquivo entre repositórios - reimplanta o
// padronizador (deploy automático já existente) e o arquivo atualiza
// sozinho. Usa as mesmas VITE_* do build principal (Vite já resolve
// import.meta.env.VITE_* igual nas duas passadas).
import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({

    build: {

        outDir: "dist",
        emptyOutDir: false, // não apaga o que o build do app normal já gerou

        lib: {
            entry: resolve(__dirname, "src/headless/importarEPublicar.js"),
            name: "FarmaTechImportador",
            formats: ["es"],
            fileName: () => "importador-automatico.js"
        }

    }

});
