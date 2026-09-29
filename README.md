# Boleias - Gestão de Viagens

Página web estática (`index.html` + `styles.css` + `app.js`) para dividir o custo de combustível entre colegas que partilham boleias semanais.

Usa o preço real do combustível da [API da DGEG](https://precoscombustiveis.dgeg.gov.pt/) (ou o preço da eletricidade, para carros elétricos), a distância da viagem e o consumo do carro de quem conduz para calcular quanto cada pessoa deve pagar, dia a dia, de segunda a sexta.

Não tem backend nem base de dados. Tudo corre no browser.

## Como usar

1. Em **Combustível**, escolher tipo, distrito e município. Os postos aparecem ordenados do mais barato para o mais caro, já com o preço — ao escolher um, o preço é aplicado automaticamente. Em alternativa, usar a **Média Nacional** do dia com um clique. Os filtros de marca e tipo de posto (auto-estrada, hipermercado) são opcionais.
2. Se alguém tiver carro elétrico, em **Eletricidade** escolher uma tarifa sugerida ou escrever o preço em €/kWh. Os valores sugeridos são indicativos (a DGEG não publica preços de eletricidade).
3. Em **Parâmetros**, preencher os km totais (ida + volta) e o consumo do carro padrão.
4. Em **Pessoas**, adicionar uma vez os nomes de quem partilha as boleias.
5. Em **Carros**, cada pessoa usa o carro padrão por defeito. Para quem tem outro carro, escolher **⛽ Combustão** (consumo próprio, preço do combustível) ou **⚡ Elétrico** (consumo em kWh/100km, preço da eletricidade).
6. Em cada dia da **Semana**, escolher quem conduz no dropdown e tocar nos nomes para marcar quem vai na ida e na volta. O botão **todos** marca/desmarca toda a gente num sentido; **⧉ copiar** repete o dia anterior.
7. Os valores por pessoa aparecem automaticamente em cada dia (com o custo por sentido do carro desse dia) e no **Total Semana**.
8. **Copiar Resumo** gera um texto pronto a colar numa mensagem ou email.

## Cálculo

O valor de km é a viagem completa (ida + volta). O custo por sentido:

```
kmSentido = kmTotal / 2
custoPorSentido = (kmSentido * consumo / 100) * preço
```

O carro usado em cada dia é o de quem conduz:

| Carro | Consumo | Preço |
|---|---|---|
| Padrão | Parâmetros (L/100km) | Combustível escolhido (€/L) |
| ⛽ Combustão | próprio (L/100km) | Combustível escolhido (€/L) |
| ⚡ Elétrico | próprio (kWh/100km) | Eletricidade (€/kWh) |

Nos combustíveis vendidos ao kg ou ao m³ (GNC, GNL), a unidade acompanha o combustível escolhido (ex.: kg/100km e €/kg). O consumo do computador de bordo de um elétrico não inclui as perdas no carregamento (~10%); para um valor mais real, usar o consumo medido à tomada.

O condutor entra na divisão mas não aparece como linha de custo. O custo da ida divide-se por quem vai na ida + condutor; o mesmo para a volta. Se alguém vai nos dois sentidos, soma os dois valores. Se vai só num, aparece anotação `(só ida)` ou `(só volta)`.

Os valores diários acumulam-se no **Total Semana**.

## Persistência

Tudo é guardado no `localStorage` com a chave `boleias_dados` (formato `version: 3`):

- Lista de pessoas
- Carros por pessoa (`carros: { nome: { energia: 'combustao' | 'eletrico', consumo } }`); quem não aparece usa o carro padrão
- Dados da semana: condutor, ida, volta e nota de cada dia
- Parâmetros: km e consumo do carro padrão
- Preço da eletricidade (€/kWh)
- Filtros de combustível: tipo, distrito, município, marca, posto
- Preço do combustível (valor e data)

Os formatos antigos são migrados automaticamente:

- **v1** (campos de texto com nomes separados por vírgula): os nomes encontrados passam para a lista de pessoas e as seleções de cada dia são preservadas.
- **v2**: fica sem carros definidos, ou seja, toda a gente usa o carro padrão, como antes.

Ao reabrir a página, os filtros e os dados são restaurados. **Limpar Semana** apaga os dias mas mantém as pessoas, os carros, os filtros e os parâmetros.

## API da DGEG

Base URL: `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb`

Todas as respostas têm o formato `{ status, mensagem, resultado }`.

### Endpoints usados pela app

| Endpoint | Parâmetros | Devolve |
|---|---|---|
| `/GetTiposCombustiveis` | — | 14 combustíveis `{Id, Descritivo, UnidadeMedida, fl_rodoviario}` |
| `/GetDistritos` | — | 18 distritos `{Id, Descritivo}` |
| `/GetMunicipios` | — | 280 municípios `{Id, Descritivo, IdDistrito, Distrito}` |
| `/GetMarcas` | — | ~80 marcas `{Id, Descritivo}` |
| `/GetTiposPostos` | — | 3 tipos: Auto-estrada, Área comercial (Hipermercados), Outro |
| `/PesquisarPostos` | `idsTiposComb, idMarca, idTipoPosto, idDistrito, idsMunicipios, qtdPorPagina, pagina` | Postos **ordenados por preço crescente**, cada um já com `Preco`, `DataAtualizacao`, `Morada`, `Localidade`, `CodPostal`, `Latitude`, `Longitude` |
| `/GetDadosPosto` | `id` | Ficha do posto: `Morada`, `HorarioPosto`, `Servicos`, `MeiosPagamento` e `Combustiveis[{TipoCombustivel, Preco, DataAtualizacao}]` |
| `/PMD` | `idsTiposComb, dataIni, dataFim, qtdPorPagina, pagina, orderDesc` | Preço médio diário nacional: `{Data, PrecoMedio, PrecoMin, PrecoMax, NumPostos}` |

### Outros endpoints existentes (não usados)

`/GetDadosPostoMapa?id=` (ficha para o mapa), `/ListarDadosPostos` (ficha completa de todos os postos, usado pelo mapa do site), `/ListarTopPostos?idTipoCombustivel=&qtdResultado=` (top N mais baratos a nível nacional), `/PMDGrafico` (série temporal para gráfico), `/RelatorioPostos` (relatório).

### Notas

- Como `PesquisarPostos` já devolve o preço do combustível pesquisado, o preço é aplicado automaticamente ao escolher um posto; o botão **Atualizar Preço** apenas força um refresh via `/GetDadosPosto` (correspondência por texto `TipoCombustivel === nome selecionado`).
- Se a API estiver indisponível, os filtros base (combustíveis, distritos, municípios, marcas) são carregados a partir de uma lista local em `fallback-filters.js`. Nesse caso, a pesquisa de postos, a média nacional e a atualização de preço ficam desativadas até a API voltar.

## Layout

A semana é uma grelha de cards de dia (um por coluna em mobile, várias colunas em desktop). O dia atual aparece destacado com a etiqueta **hoje**.

## Limitações

- Dados ficam apenas neste browser (limpar dados do browser apaga tudo).
- Depende da disponibilidade da API da DGEG.
- O preço da eletricidade é introduzido à mão: nos postos públicos (MOBI.E) depende do contrato de cada um com o comercializador, da tarifa do operador do posto, da taxa da EGME e do IEC, por isso não há um "€/kWh do posto" equivalente ao €/L.
- Todos os carros a combustão usam o mesmo combustível (o escolhido em **Combustível**).
