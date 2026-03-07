# Boleias - Gestão de Viagens

Página web (ficheiro único `boleias.html`) para organizar boleias semanais e calcular quanto cada passageiro deve pagar em gasóleo, com base em:

- preço real do combustível obtido da [API da DGEG](https://precoscombustiveis.dgeg.gov.pt/)
- distância total da viagem
- consumo do carro (L/100km)
- pessoas que vão na ida e/ou volta

Foi pensada para um fluxo simples de uso semanal (Segunda a Sexta), sem backend e sem base de dados.

## O que esta página faz

1. Carrega listas de combustíveis, distritos, municípios, marcas e postos.
   - Se a API externa falhar (ex.: indisponibilidade de rede ou problema SSL/certificado), usa listas locais para combustíveis, distritos e municípios, para que os filtros base continuem disponíveis.
2. Permite escolher um posto especifico e atualizar o preço de combustível.
3. Calcula automaticamente o custo por sentido (ida ou volta).
4. Distribui o custo por passageiro em cada dia, incluindo o condutor na divisão.
5. Mostra totais acumulados por pessoa no final da semana.
6. Guarda os dados localmente no browser (`localStorage`) para nao perder preenchimento ao recarregar a pagina.
7. Permite limpar a semana e copiar um resumo textual para partilha.

## Estrutura da pagina

- **Combustível**
  - Filtros: Tipo, Distrito, Municipio, Marca, Posto.
  - Botao **Atualizar Preço** para ir buscar o preco mais recente do posto selecionado.

- **Parâmetros**
  - `Km Viagem (total)`
  - `Consumo (L/100km)`
  - Mostra `Custo por sentido`.

- **Semana**
  - Linhas para Segunda a Sexta.
  - Campos por dia:
    - `Quem Leva` (condutor)
    - `Ida` (nomes separados por vírgula)
    - `Volta` (nomes separados por vírgula)
    - `Gasóleo (€)` (calculado automaticamente)
    - `Nota` (campo opcional)

- **Total Semana**
  - Cartões com total por pessoa.

- **Ações**
  - `Limpar Semana`
  - `Copiar Resumo`

## Como usar

1. Na secção **Combustível**:
   - escolher tipo de combustível
   - escolher distrito e município
   - opcionalmente filtrar por marca
   - escolher posto
   - clicar em **Atualizar Preço**
3. Na secção **Parâmetros**, ajustar km totais e consumo.
4. Na tabela da semana, preencher:
   - condutor
   - passageiros da ida e volta (separados por vírgulas)
5. Confirmar os valores em `Gasóleo (€)` e em `Total Semana`.
6. Usar **Copiar Resumo** para copiar texto pronto para mensagem/email.

## Regras de cálculo

### 1) Custo por sentido

A página assume que o valor de `Km Viagem (total)` inclui ida + volta.

Formula:

`kmSentido = kmTotal / 2`

`custoPorSentido = (kmSentido * consumoL100 / 100) * precoCombustivel`

### 2) Divisão por pessoa em cada dia

- O condutor continua fora da lista mostrada de passageiros (não aparece como linha de custo), mas entra na divisão.
- O custo da ida é dividido entre quem vai na ida + condutor.
- O custo da volta é dividido entre quem vai na volta + condutor.
- Se uma pessoa for em ambos os sentidos, soma os dois valores.
- Se for apenas num sentido, aparece anotação `(só ida)` ou `(só volta)`.

### 3) Total semanal

Os valores diários de cada pessoa são acumulados e apresentados na caixa **Total Semana**.

## Persistência de dados

A página guarda automaticamente no `localStorage` com a chave:

- `boleias_dados`

Campos guardados:

- `condutor_0..4`, `ida_0..4`, `volta_0..4`, `nota_0..4`
- `kmViagem`
- `consumoCarro`

Ao abrir/recarregar a página, os dados são restaurados.

## Integracao com API

Base URL:

- `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb`

Endpoints usados:

- `/GetTiposCombustiveis`
- `/GetDistritos`
- `/GetMunicipios`
- `/GetMarcas`
- `/PesquisarPostos?...`
- `/GetDadosPosto?id=...`

Observacao importante:

- A pesquisa de combustível no posto é feita por comparação de texto (`TipoCombustivel === nome selecionado`).

## Botão "Copiar Resumo"

Gera um texto com:

- cabeçalho `RESUMO BOLEIAS`
- linhas por dia preenchido com condutor, ida, volta e gasóleo
- secção final `TOTAIS` com total por pessoa

Depois copia esse texto para a área de transferência (`clipboard`) e mostra alerta de confirmação.

## Responsividade

- Desktop: tabela tradicional.
- Mobile: tabela transforma-se em "cards" por dia para facilitar leitura/preenchimento.

## Limites atuais

- Sem backend/autenticação.
- Dados apenas no browser atual (se limpar dados do browser, perde histórico).
- Dependência de disponibilidade da API externa.
- A pesquisa de postos e a atualização de preço continuam dependentes da disponibilidade da API externa da DGEG.
- Nao há validação avançada de nomes duplicados com grafias diferentes (ex.: `Ana` vs `ana ` é tratado em parte, mas variações maiores continuam distintas).

## Melhorias possíveis

- Tratamento robusto de erros de rede/API (mensagens mais detalhadas).
- Exportar tambem para CSV/PDF.
- Configuração de mais dias ou semanas personalizadas.
- Normalização mais forte de nomes (acentos, espaços extra, alias).
- Tema claro/escuro e preferências do utilizador.
