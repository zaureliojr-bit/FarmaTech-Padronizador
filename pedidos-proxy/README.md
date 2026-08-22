# Pedidos Proxy

Worker do Cloudflare que guarda o histórico de pedidos do site num
banco D1, e serve os relatórios para o painel da loja.

Até aqui o pedido ia só para uma planilha, com todos os itens numa
célula de texto — algo como `2x Dipirona [789...] | 1x Novalgina [789...]`.
Dá para ler um pedido assim, mas não dá para somar: "quantas dipironas
eu vendi esse mês" exige quebrar string. Aqui **cada item é uma linha**,
e daí saem os relatórios de produtos vendidos, faturamento por dia e
clientes que voltaram.

O envio para a planilha continua acontecendo em paralelo. Os dois
caminhos convivem até você confiar no painel.

## Deploy (painel do Cloudflare, sem linha de comando)

### 1. Criar o banco D1

1. **Armazenamento e Bancos de Dados** → **D1 SQL Database** → **Criar**.
2. Nome: `farmatech-pedidos-db`.
3. Aberto o banco, vá em **Console**, cole o conteúdo de `schema.sql`
   deste diretório e **Executar**. Cria as três tabelas; rodar de novo
   não estraga nada.

> Pode usar o mesmo banco do `imagens-proxy` se preferir um só — os
> nomes de tabela não conflitam. Bancos separados só deixam mais fácil
> apagar um sem mexer no outro.

### 2. Criar o worker

1. **Workers e Páginas** → **Criar** → **Criar Worker**, nome
   `farmatech-pedidos-proxy` → **Implantar**.
2. **Editar código** → apaga o conteúdo padrão, cola o `worker.js`
   deste diretório → **Implantar**.

### 3. Ligar o worker ao D1

Na página do worker → **Configurações** → **Bindings** → **Adicionar**:

- Tipo **D1 Database** → nome da variável `DB` → banco
  `farmatech-pedidos-db` (o do passo 1).

### 4. Criar a senha do painel

Ainda em **Configurações** → **Variáveis e Secrets** → **Adicionar**:

- Tipo **Secret**, nome `PAINEL_KEY`, valor: uma senha que você inventa.

É ela que abre o painel. Sem ela, os relatórios respondem 401.

### 5. Apontar o site para o worker

Copie a URL do worker (algo como
`https://farmatech-pedidos-proxy.SEU-SUBDOMINIO.workers.dev`) e coloque
no topo do `script.js` do site, em `API_PEDIDOS_D1`.

## Rotas

| Método | Rota | Precisa de senha | Para quê |
|---|---|---|---|
| POST | `/pedidos` | não | o site grava um pedido |
| GET | `/resumo?dias=30` | sim | números do painel |
| GET | `/pedidos/{ref}` | sim | um pedido com os itens |
| GET | `/clientes?limite=100` | sim | quem já comprou |
| POST | `/status` | sim | muda o status de um pedido |

Status aceitos: `novo`, `separando`, `receita-ok`, `entregue`, `cancelado`.

## Por que gravar pedido não tem senha

Quem grava é o site, que é público. Qualquer chave colocada ali estaria
visível no código-fonte da página, protegendo nada. No lugar disso o
worker valida o formato com rigor, limita tamanho de texto e número de
itens, e recalcula o total de cada linha em vez de confiar no que
chegou. É a mesma exposição que a planilha já tinha — a diferença é que
aqui o dado chega limpo e um pedido repetido não duplica itens.

Se um dia isso incomodar, o caminho é o Turnstile do próprio Cloudflare
na finalização do pedido, não uma chave no JavaScript.

## Sobre os dados dos clientes

A tabela `clientes` é o resumo do que os pedidos já dizem: nome,
telefone, último endereço e totais. Serve para o balcão reconhecer quem
está ligando e para ver quem voltou a comprar.

Isso é dado pessoal e vale tratar como tal. O aviso no site diz que os
dados são usados "apenas para preparar e entregar este pedido" — se um
dia a loja quiser usar essa lista para promoção ou mensagem em massa,
o texto do site precisa mudar antes, e o cliente precisa consentir.

Para apagar os dados de alguém que pedir (é direito dele pela LGPD),
no Console do D1:

```sql
DELETE FROM clientes WHERE telefone = '11987654321';
UPDATE pedidos SET cliente = '(removido)', telefone = '', endereco = ''
 WHERE telefone = '11987654321';
```

O pedido em si fica — a farmácia precisa dele para a escrituração — mas
sem os dados que identificam a pessoa.

## Limites do plano gratuito

D1 no free tier: 5 GB de armazenamento e 5 milhões de linhas lidas por
dia. Um pedido com 5 itens ocupa por volta de 1 KB. Não é o tipo de
coisa que essa loja vai estourar.
