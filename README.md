# Boleias - Gestão de Viagens

Página web (`index.html`, ficheiro único) para dividir o custo de combustível entre colegas que partilham boleias semanais.

Usa o preço real do combustível da [API da DGEG](https://precoscombustiveis.dgeg.gov.pt/), a distância da viagem e o consumo do carro para calcular quanto cada pessoa deve pagar, dia a dia, de segunda a sexta.

Não tem backend nem base de dados. Tudo corre no browser.

## Como usar

1. Em **Combustível**, escolher tipo, distrito, município, e posto. Clicar em **Atualizar Preço**.
2. Em **Parâmetros**, preencher os km totais (ida + volta) e o consumo do carro.
3. Na tabela da **Semana**, preencher por dia: quem conduz, quem vai na ida, quem vai na volta.
4. Os valores por pessoa aparecem automaticamente na coluna **Gasóleo** e no **Total Semana**.
5. **Copiar Resumo** gera um texto pronto a colar numa mensagem ou email.

## Cálculo

O valor de km é a viagem completa (ida + volta). O custo por sentido:

```
kmSentido = kmTotal / 2
custoPorSentido = (kmSentido * consumo / 100) * preçoCombustível
```

O condutor entra na divisão mas não aparece como linha de custo. O custo da ida divide-se por quem vai na ida + condutor; o mesmo para a volta. Se alguém vai nos dois sentidos, soma os dois valores. Se vai só num, aparece anotação `(só ida)` ou `(só volta)`.

Os valores diários acumulam-se no **Total Semana**.

## Persistência

Tudo é guardado no `localStorage` com a chave `boleias_dados`:

- Dados da tabela: condutor, ida, volta e nota de cada dia
- Parâmetros: km e consumo
- Filtros de combustível: tipo, distrito, município, marca, posto
- Preço do combustível (valor e data)

Ao reabrir a página, os filtros e os dados são restaurados. **Limpar Semana** apaga os campos da tabela mas mantém os filtros e parâmetros.

## API da DGEG

Base URL: `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb`

Endpoints: `/GetTiposCombustiveis`, `/GetDistritos`, `/GetMunicipios`, `/GetMarcas`, `/PesquisarPostos`, `/GetDadosPosto`

Se a API estiver indisponível, os filtros (combustíveis, distritos, municípios, marcas) são carregados a partir de uma lista local em `fallback-filters.js`. Nesse caso, a pesquisa de postos e a atualização de preço ficam desativadas até a API voltar.

A correspondência do combustível no posto é feita por comparação de texto (`TipoCombustivel === nome selecionado`).

## Layout

Em desktop, a semana aparece numa tabela. Em mobile, cada dia vira um card para facilitar o preenchimento.

## Limitações

- Dados ficam apenas neste browser (limpar dados do browser apaga tudo).
- Depende da disponibilidade da API da DGEG.
- Nomes com grafias diferentes (ex.: `Ana` vs `ana`) são normalizados em minúsculas, mas variações maiores (acentos, abreviaturas) continuam a ser tratadas como pessoas distintas.
