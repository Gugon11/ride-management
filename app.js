const BASE = "https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb";
const STORAGE_KEY = 'boleias_dados';
const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const fallbackFilterState = { combustiveis: false, distritos: false, municipios: false, marcas: false };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch((e) => {
      console.error('Falha no registo do service worker', e);
    });
  });
}

// ── Estado ──
let allMunicipios = [];
let allMarcas = [];
let postosList = []; // resultados completos de PesquisarPostos (com preço, morada, etc.)
let fuelPrice = null;
let mediaNacional = null; // { preco, data, numPostos } do PMD
let pessoas = []; // nomes únicos
let semana = DIAS.map(() => ({ condutor: '', ida: [], volta: [], nota: '' }));

const $ = (id) => document.getElementById(id);

// ── Init ──
window.addEventListener('load', async () => {
  $('dateBadge').textContent = new Date().toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  carregarDados();
  buildSemana();
  renderPessoas();
  renderSemana();
  wireEvents();
  await carregarFiltros();
  await carregarFiltrosGuardados();
  calcularTudo();
  carregarMediaNacional();
});

function wireEvents() {
  $('selComb').addEventListener('change', onCombChange);
  $('selDistrito').addEventListener('change', onDistritoChange);
  $('selMunicipio').addEventListener('change', onMunicipioChange);
  $('selMarca').addEventListener('change', onMarcaChange);
  $('selTipoPosto').addEventListener('change', onTipoPostoChange);
  $('selPosto').addEventListener('change', onPostoChange);
  $('btnAtualizarPreco').addEventListener('click', atualizarPreco);
  $('btnUsarMedia').addEventListener('click', usarMediaNacional);
  $('kmViagem').addEventListener('input', calcularTudo);
  $('consumoCarro').addEventListener('input', calcularTudo);
  $('btnAddPessoa').addEventListener('click', adicionarPessoa);
  $('inputPessoa').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); adicionarPessoa(); }
  });
  $('btnLimparSemana').addEventListener('click', limparSemana);
  $('btnCopiarResumo').addEventListener('click', copiarResumo);
}

// ── API fetch helper ──
async function api(endpoint) {
  const r = await fetch(BASE + endpoint);
  if (!r.ok) throw new Error('Falha HTTP ' + r.status);
  const j = await r.json();
  if (!j || j.status === false || typeof j.resultado === 'undefined' || j.resultado === null) {
    throw new Error((j && j.mensagem) || 'Resposta inválida da API');
  }
  return j.resultado;
}

function pickFilterData(result, fallback, key, label, fallbackUsados) {
  if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0) return result.value;
  fallbackFilterState[key] = true;
  fallbackUsados.push(label);
  return fallback || [];
}

function formatarErroApi(err, msgPadrao) {
  const msg = err && err.message ? err.message : '';
  if (msg.includes('Failed to fetch') || msg.includes('Load failed')) {
    return msgPadrao + ' A API externa pode estar indisponível ou com problema de certificado.';
  }
  return msgPadrao;
}

function pesquisaPostosDisponivel() {
  return !fallbackFilterState.combustiveis && !fallbackFilterState.distritos && !fallbackFilterState.municipios && !fallbackFilterState.marcas;
}

// ── Lazy load fallback filters ──
async function carregarFallbacks() {
  if (window.FALLBACK_FILTERS) return window.FALLBACK_FILTERS;
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'fallback-filters.js';
    s.onload = () => resolve(window.FALLBACK_FILTERS || {});
    s.onerror = () => { console.error('Falha ao carregar fallback-filters.js'); resolve({}); };
    document.head.appendChild(s);
  });
}

// ── Carregar filtros ──
async function carregarFiltros() {
  setStatus('precoStatus', 'A carregar filtros...', '');

  const resultados = await Promise.allSettled([
    api('/GetTiposCombustiveis'),
    api('/GetDistritos'),
    api('/GetMunicipios'),
    api('/GetMarcas'),
    api('/GetTiposPostos'),
  ]);

  // Só carrega o ficheiro de fallback se algum endpoint base falhou
  // (GetTiposPostos é opcional e não tem fallback)
  const algumFalhou = resultados.slice(0, 4).some(r => r.status !== 'fulfilled' || !Array.isArray(r.value) || r.value.length === 0);
  const fb = algumFalhou ? await carregarFallbacks() : {};

  const fallbackUsados = [];
  const combs = pickFilterData(resultados[0], fb.combustiveis, 'combustiveis', 'combustíveis', fallbackUsados);
  const distritos = pickFilterData(resultados[1], fb.distritos, 'distritos', 'distritos', fallbackUsados);
  const municipios = pickFilterData(resultados[2], fb.municipios, 'municipios', 'municípios', fallbackUsados);
  const marcas = pickFilterData(resultados[3], fb.marcas, 'marcas', 'marcas', fallbackUsados);

  allMunicipios = municipios;
  allMarcas = marcas;

  // Combustíveis
  const selC = $('selComb');
  selC.innerHTML = '<option value="">— escolhe —</option>';
  combs.forEach(c => selC.innerHTML += `<option value="${c.Id}">${c.Descritivo}</option>`);

  // Distritos
  const selD = $('selDistrito');
  selD.innerHTML = '<option value="">— escolhe —</option>';
  distritos.forEach(d => selD.innerHTML += `<option value="${d.Id}">${d.Descritivo}</option>`);
  selD.disabled = false;

  // Marcas
  const selM = $('selMarca');
  selM.innerHTML = '<option value="">Todas</option>';
  marcas.forEach(m => selM.innerHTML += `<option value="${m.Id}">${m.Descritivo}</option>`);

  // Tipos de posto (opcional — fica só "Todos" se a API falhar)
  const selTP = $('selTipoPosto');
  selTP.innerHTML = '<option value="">Todos</option>';
  if (resultados[4].status === 'fulfilled' && Array.isArray(resultados[4].value)) {
    resultados[4].value.forEach(t => selTP.innerHTML += `<option value="${t.Id}">${t.Descritivo}</option>`);
  }

  if (fallbackUsados.length > 0) {
    setStatus('precoStatus', 'A usar lista local para ' + fallbackUsados.join(', ') + '.', 'err');
  } else {
    setStatus('precoStatus', '', '');
  }
}

function onCombChange() {
  atualizarPostosSeReady();
  carregarMediaNacional();
  guardarDados();
}

function onDistritoChange() {
  const idDistrito = $('selDistrito').value;

  // API: campo IdDistrito; fallback local: objeto aninhado Distrito.Id
  const municipiosFiltrados = allMunicipios.filter(m =>
    String(m.IdDistrito) === idDistrito || (m.Distrito && String(m.Distrito.Id) === idDistrito));

  const selMun = $('selMunicipio');
  selMun.innerHTML = '<option value="">— escolhe —</option>';
  municipiosFiltrados.forEach(m => selMun.innerHTML += `<option value="${m.Id}">${m.Descritivo}</option>`);
  selMun.disabled = false;

  // Reset posto
  resetPosto();
  guardarDados();
}

async function onMunicipioChange() {
  $('selMarca').disabled = false;
  $('selTipoPosto').disabled = false;
  await atualizarPostos();
  guardarDados();
}

async function onMarcaChange() {
  await atualizarPostos();
  guardarDados();
}

async function onTipoPostoChange() {
  await atualizarPostos();
  guardarDados();
}

function resetPosto() {
  const sel = $('selPosto');
  sel.innerHTML = '<option value="">— escolhe município —</option>';
  sel.disabled = true;
  postosList = [];
  $('precoValor').textContent = '—';
  $('precoData').textContent = '';
  $('precoMorada').textContent = '';
  fuelPrice = null;
  calcularTudo();
}

async function atualizarPostos() {
  const idComb      = $('selComb').value;
  const idDistrito  = $('selDistrito').value;
  const idMun       = $('selMunicipio').value;
  const idMarca     = $('selMarca').value;
  const idTipoPosto = $('selTipoPosto').value;

  if (!idComb || !idDistrito || !idMun) { resetPosto(); return; }
  if (!pesquisaPostosDisponivel()) {
    resetPosto();
    setStatus('precoStatus', 'Os filtros base estão disponíveis, mas a pesquisa de postos precisa da API externa.', 'err');
    return;
  }

  const selPosto = $('selPosto');
  selPosto.innerHTML = '<option>A carregar...</option>';
  selPosto.disabled = true;

  try {
    const url = `/PesquisarPostos?idsTiposComb=${idComb}&idMarca=${idMarca}&idTipoPosto=${idTipoPosto}&idDistrito=${idDistrito}&idsMunicipios=${idMun}&qtdPorPagina=50&pagina=1`;
    const postos = await api(url);

    postosList = postos || [];

    if (!postos || postos.length === 0) {
      selPosto.innerHTML = '<option>Nenhum posto encontrado</option>';
      return;
    }

    // A API devolve os postos ordenados por preço crescente, já com o preço incluído
    selPosto.innerHTML = '<option value="">— escolhe posto —</option>';
    postos.forEach(p => {
      const preco = p.Preco ? p.Preco + ' · ' : '';
      selPosto.innerHTML += `<option value="${p.Id}">${preco}${p.Nome}</option>`;
    });
    selPosto.disabled = false;
    setStatus('precoStatus', '', '');
  } catch (e) {
    postosList = [];
    selPosto.innerHTML = '<option>Erro ao carregar postos</option>';
    selPosto.disabled = true;
    setStatus('precoStatus', formatarErroApi(e, 'Não foi possível carregar os postos.'), 'err');
    console.error('Falha ao carregar postos', e);
  }
}

function atualizarPostosSeReady() {
  const idMun = $('selMunicipio').value;
  if (idMun) atualizarPostos();
}

function onPostoChange() {
  // Aplica logo o preço que veio na pesquisa — sem precisar de "Atualizar Preço"
  const posto = postosList.find(p => String(p.Id) === $('selPosto').value);
  if (posto && aplicarPrecoDoPosto(posto)) {
    setStatus('precoStatus', 'Preço aplicado automaticamente.', 'ok');
  } else {
    $('precoValor').textContent = '—';
    $('precoData').textContent = '';
    $('precoMorada').textContent = '';
    fuelPrice = null;
  }
  calcularTudo();
  guardarDados();
}

// Preenche preço/data/morada a partir de um resultado de PesquisarPostos.
function aplicarPrecoDoPosto(p) {
  const preco = parseFloat(String(p.Preco || '').replace(',', '.'));
  if (!isFinite(preco) || preco <= 0) return false;
  fuelPrice = preco;
  $('precoValor').textContent = preco.toFixed(3) + ' €/L';
  $('precoData').textContent = 'Atualizado: ' + (p.DataAtualizacao || '');
  $('precoMorada').textContent = [p.Morada, p.Localidade].filter(Boolean).join(', ');
  return true;
}

// ── Média nacional (PMD) ──
async function carregarMediaNacional() {
  const box = $('mediaBox');
  const idComb = $('selComb').value;
  mediaNacional = null;
  if (!idComb) { box.hidden = true; return; }

  try {
    const fim = new Date();
    const ini = new Date(fim.getTime() - 7 * 24 * 3600 * 1000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const res = await api(`/PMD?idsTiposComb=${idComb}&dataIni=${iso(ini)}&dataFim=${iso(fim)}&qtdPorPagina=1&pagina=1&orderDesc=1`);
    const dia = Array.isArray(res) ? res[0] : null;
    const preco = dia ? parseFloat(String(dia.PrecoMedio || '').replace(',', '.')) : NaN;
    if (!dia || !isFinite(preco) || preco <= 0) { box.hidden = true; return; }

    mediaNacional = { preco, data: dia.Data, numPostos: dia.NumPostos };
    $('mediaValor').textContent = preco.toFixed(3) + ' €/L';
    $('mediaData').textContent = `${dia.Data} · ${dia.NumPostos} postos`;
    box.hidden = false;
  } catch (e) {
    box.hidden = true;
    console.error('Falha ao carregar média nacional', e);
  }
}

function usarMediaNacional() {
  if (!mediaNacional) return;
  fuelPrice = mediaNacional.preco;
  $('precoValor').textContent = mediaNacional.preco.toFixed(3) + ' €/L';
  $('precoData').textContent = 'Média nacional de ' + mediaNacional.data;
  $('precoMorada').textContent = '';
  $('selPosto').value = '';
  setStatus('precoStatus', 'A usar a média nacional.', 'ok');
  calcularTudo();
  guardarDados();
}

// ── Atualizar Preço ──
async function atualizarPreco() {
  const idPosto = $('selPosto').value;
  const selComb = $('selComb');
  const combOpt = selComb.options[selComb.selectedIndex];
  const combNome = combOpt ? combOpt.text : '';

  if (!idPosto) { setStatus('precoStatus', 'Seleciona um posto primeiro.', 'err'); return; }
  if (!pesquisaPostosDisponivel()) {
    setStatus('precoStatus', 'Não é possível atualizar o preço sem acesso à API externa.', 'err');
    return;
  }

  setStatus('precoStatus', 'A buscar...', '');

  try {
    const dados = await api('/GetDadosPosto?id=' + idPosto);
    const combustiveis = Array.isArray(dados.Combustiveis) ? dados.Combustiveis : [];
    const comb = combustiveis.find(c => c.TipoCombustivel === combNome);

    if (!comb) {
      setStatus('precoStatus', 'Combustível não encontrado neste posto.', 'err');
      return;
    }

    fuelPrice = parseFloat(comb.Preco.replace(',', '.'));
    $('precoValor').textContent = fuelPrice.toFixed(3) + ' €/L';
    $('precoData').textContent = 'Atualizado: ' + comb.DataAtualizacao;
    setStatus('precoStatus', 'Atualizado', 'ok');

    calcularTudo();
  } catch (e) {
    setStatus('precoStatus', formatarErroApi(e, 'Não foi possível atualizar o preço.'), 'err');
    console.error('Falha ao atualizar preço', e);
  }
}

// ── Pessoas ──
function adicionarPessoa() {
  const input = $('inputPessoa');
  const nome = input.value.trim();
  if (!nome) return;
  if (pessoas.some(p => p.toLowerCase() === nome.toLowerCase())) {
    input.value = '';
    return;
  }
  pessoas.push(nome);
  input.value = '';
  input.focus();
  renderPessoas();
  renderSemana();
  calcularTudo();
}

function removerPessoa(nome) {
  pessoas = pessoas.filter(p => p !== nome);
  semana.forEach(d => {
    if (d.condutor === nome) d.condutor = '';
    d.ida = d.ida.filter(p => p !== nome);
    d.volta = d.volta.filter(p => p !== nome);
  });
  renderPessoas();
  renderSemana();
  calcularTudo();
}

function renderPessoas() {
  const cont = $('pessoasChips');
  cont.innerHTML = '';
  if (pessoas.length === 0) {
    const vazio = document.createElement('span');
    vazio.className = 'chips-empty';
    vazio.textContent = 'Ainda sem pessoas.';
    cont.appendChild(vazio);
    return;
  }
  pessoas.forEach(nome => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip on';
    chip.title = 'Remover ' + nome;
    chip.appendChild(document.createTextNode(nome));
    const x = document.createElement('span');
    x.className = 'chip-remove';
    x.textContent = '×';
    chip.appendChild(x);
    chip.addEventListener('click', () => removerPessoa(nome));
    cont.appendChild(chip);
  });
}

// ── Semana ──
function buildSemana() {
  const grid = $('weekGrid');
  grid.innerHTML = '';
  const hoje = new Date().getDay(); // 0=Dom, 1=Seg ... 5=Sex
  const hojeIdx = (hoje >= 1 && hoje <= 5) ? hoje - 1 : -1;

  DIAS.forEach((dia, i) => {
    const card = document.createElement('article');
    card.className = 'day-card' + (i === hojeIdx ? ' today' : '');

    const head = document.createElement('div');
    head.className = 'day-head';
    const nome = document.createElement('span');
    nome.className = 'day-name';
    nome.textContent = dia;
    if (i === hojeIdx) {
      const tag = document.createElement('em');
      tag.className = 'today-tag';
      tag.textContent = 'hoje';
      nome.appendChild(tag);
    }
    head.appendChild(nome);
    if (i > 0) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn-copy-prev';
      copy.textContent = '⧉ copiar ' + DIAS[i - 1];
      copy.title = 'Copiar condutor, ida e volta de ' + DIAS[i - 1];
      copy.addEventListener('click', () => copiarDiaAnterior(i));
      head.appendChild(copy);
    }
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'day-body';
    body.innerHTML = `
      <div class="field">
        <label for="condutor_${i}">Quem leva</label>
        <select id="condutor_${i}"></select>
      </div>
      <div class="chips-block">
        <label>Ida <button type="button" class="chip-todos" id="todosIda_${i}">todos</button></label>
        <div class="chips" id="ida_${i}"></div>
      </div>
      <div class="chips-block">
        <label>Volta <button type="button" class="chip-todos" id="todosVolta_${i}">todos</button></label>
        <div class="chips" id="volta_${i}"></div>
      </div>
      <div class="day-gas" id="gasoleo_${i}"><span class="status">—</span></div>
      <div class="field day-nota">
        <label for="nota_${i}">Nota</label>
        <textarea id="nota_${i}" rows="1"></textarea>
      </div>
    `;
    card.appendChild(body);
    grid.appendChild(card);

    body.querySelector(`#condutor_${i}`).addEventListener('change', (e) => {
      const novo = e.target.value;
      semana[i].condutor = novo;
      // O condutor não conta como passageiro
      semana[i].ida = semana[i].ida.filter(p => p !== novo);
      semana[i].volta = semana[i].volta.filter(p => p !== novo);
      renderDia(i);
      calcularTudo();
    });
    body.querySelector(`#todosIda_${i}`).addEventListener('click', () => toggleTodos(i, 'ida'));
    body.querySelector(`#todosVolta_${i}`).addEventListener('click', () => toggleTodos(i, 'volta'));
    body.querySelector(`#nota_${i}`).addEventListener('input', (e) => {
      semana[i].nota = e.target.value;
      autoResize(e.target);
      guardarDados();
    });
  });
}

function renderSemana() {
  DIAS.forEach((_, i) => renderDia(i));
}

function renderDia(i) {
  const dia = semana[i];

  // Condutor (dropdown com as pessoas)
  const sel = $(`condutor_${i}`);
  sel.innerHTML = '<option value="">—</option>';
  pessoas.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
  if (dia.condutor && !pessoas.includes(dia.condutor)) dia.condutor = '';
  sel.value = dia.condutor;
  sel.disabled = pessoas.length === 0;

  renderChipsDia(i, 'ida');
  renderChipsDia(i, 'volta');

  const nota = $(`nota_${i}`);
  if (nota.value !== dia.nota) nota.value = dia.nota;
  autoResize(nota);
}

function renderChipsDia(i, sentido) {
  const cont = $(`${sentido}_${i}`);
  cont.innerHTML = '';

  if (pessoas.length === 0) {
    const vazio = document.createElement('span');
    vazio.className = 'chips-empty';
    vazio.textContent = 'Adiciona pessoas na secção acima.';
    cont.appendChild(vazio);
    return;
  }

  const dia = semana[i];
  pessoas.forEach(nome => {
    const chip = document.createElement('button');
    chip.type = 'button';
    if (nome === dia.condutor) {
      chip.className = 'chip driver';
      chip.textContent = '🚗 ' + nome;
      chip.title = nome + ' é o condutor';
      chip.disabled = true;
    } else {
      const on = dia[sentido].includes(nome);
      chip.className = 'chip' + (on ? ' on' : '');
      chip.textContent = nome;
      chip.addEventListener('click', () => {
        if (dia[sentido].includes(nome)) {
          dia[sentido] = dia[sentido].filter(p => p !== nome);
        } else {
          dia[sentido].push(nome);
        }
        chip.classList.toggle('on');
        calcularTudo();
      });
    }
    cont.appendChild(chip);
  });
}

function toggleTodos(i, sentido) {
  const dia = semana[i];
  const elegiveis = pessoas.filter(p => p !== dia.condutor);
  const todosMarcados = elegiveis.length > 0 && elegiveis.every(p => dia[sentido].includes(p));
  dia[sentido] = todosMarcados ? [] : [...elegiveis];
  renderChipsDia(i, sentido);
  calcularTudo();
}

function copiarDiaAnterior(i) {
  const prev = semana[i - 1];
  semana[i].condutor = prev.condutor;
  semana[i].ida = [...prev.ida];
  semana[i].volta = [...prev.volta];
  renderDia(i);
  calcularTudo();
}

// ── Auto-resize textareas ──
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ── Persistência (localStorage) ──
function guardarDados() {
  const dados = {
    version: 2,
    pessoas,
    semana,
    kmViagem: $('kmViagem').value,
    consumoCarro: $('consumoCarro').value,
    selComb: $('selComb').value,
    selDistrito: $('selDistrito').value,
    selMunicipio: $('selMunicipio').value,
    selMarca: $('selMarca').value,
    selTipoPosto: $('selTipoPosto').value,
    selPosto: $('selPosto').value,
    fuelPrice,
    precoValor: $('precoValor').textContent,
    precoData: $('precoData').textContent,
    precoMorada: $('precoMorada').textContent,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

function getDadosGuardados() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return migrarDados(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

// Converte o formato antigo (campos de texto com nomes separados por vírgula)
// para o formato v2 (lista de pessoas + arrays por dia).
function migrarDados(dados) {
  if (!dados || dados.version === 2) return dados;

  const parseNomes = (str) => (str || '').split(',').map(n => n.trim()).filter(n => n);
  const pessoasMig = [];
  const addPessoa = (nome) => {
    if (nome && !pessoasMig.some(p => p.toLowerCase() === nome.toLowerCase())) pessoasMig.push(nome);
    return pessoasMig.find(p => p.toLowerCase() === nome.toLowerCase()) || nome;
  };

  const semanaMig = DIAS.map((_, i) => {
    const condutor = (dados[`condutor_${i}`] || '').trim();
    const condutorNorm = condutor ? addPessoa(condutor) : '';
    const ida = parseNomes(dados[`ida_${i}`]).map(addPessoa).filter(p => p !== condutorNorm);
    const volta = parseNomes(dados[`volta_${i}`]).map(addPessoa).filter(p => p !== condutorNorm);
    return {
      condutor: condutorNorm,
      ida: [...new Set(ida)],
      volta: [...new Set(volta)],
      nota: dados[`nota_${i}`] || '',
    };
  });

  return { ...dados, version: 2, pessoas: pessoasMig, semana: semanaMig };
}

function carregarDados() {
  const dados = getDadosGuardados();
  if (!dados) return;

  if (Array.isArray(dados.pessoas)) pessoas = dados.pessoas;
  if (Array.isArray(dados.semana)) {
    semana = DIAS.map((_, i) => {
      const d = dados.semana[i] || {};
      return {
        condutor: d.condutor || '',
        ida: Array.isArray(d.ida) ? d.ida : [],
        volta: Array.isArray(d.volta) ? d.volta : [],
        nota: d.nota || '',
      };
    });
  }
  if (dados.kmViagem) $('kmViagem').value = dados.kmViagem;
  if (dados.consumoCarro) $('consumoCarro').value = dados.consumoCarro;
}

async function carregarFiltrosGuardados() {
  const dados = getDadosGuardados();
  if (!dados) return;

  const selComb = $('selComb');
  const selDistrito = $('selDistrito');
  const selMunicipio = $('selMunicipio');
  const selMarca = $('selMarca');
  const selTipoPosto = $('selTipoPosto');
  const selPosto = $('selPosto');

  if (dados.selComb) selComb.value = dados.selComb;

  if (dados.selDistrito) {
    selDistrito.value = dados.selDistrito;
    onDistritoChange();
  }

  if (dados.selMunicipio) {
    selMunicipio.value = dados.selMunicipio;
  }

  if (dados.selMarca !== undefined) {
    selMarca.value = dados.selMarca;
  }

  if (dados.selTipoPosto !== undefined) {
    selTipoPosto.value = dados.selTipoPosto;
  }

  if (selMunicipio.value) {
    selMarca.disabled = false;
    selTipoPosto.disabled = false;
    await atualizarPostos();
  }

  if (dados.selPosto) {
    selPosto.value = dados.selPosto;
  }

  // Se o posto guardado veio na pesquisa nova, usa o preço fresco da API;
  // caso contrário restaura o que estava guardado.
  const postoFresco = selPosto.value && postosList.find(p => String(p.Id) === selPosto.value);
  if (postoFresco && aplicarPrecoDoPosto(postoFresco)) {
    setStatus('precoStatus', 'Preço atualizado da pesquisa.', 'ok');
  } else if (dados.fuelPrice) {
    fuelPrice = Number(dados.fuelPrice);
    $('precoValor').textContent = dados.precoValor || `${fuelPrice.toFixed(3)} €/L`;
    $('precoData').textContent = dados.precoData || '';
    $('precoMorada').textContent = dados.precoMorada || '';
    setStatus('precoStatus', 'Preço restaurado da sessão anterior.', 'ok');
  }
}

// ── Cálculo principal ──
function calcularTudo() {
  const km = parseFloat($('kmViagem').value) || 0;
  const consumo = parseFloat($('consumoCarro').value) || 0;
  const preco = fuelPrice;
  const kmSentido = km / 2;

  // Custo por sentido
  const custoPorSentido = preco ? (kmSentido * consumo / 100 * preco) : null;
  $('custoPorSentido').textContent = custoPorSentido ? custoPorSentido.toFixed(2) + ' €' : '—';

  const totais = {};

  semana.forEach((dia, i) => {
    const paxIda = dia.ida.filter(p => p !== dia.condutor);
    const paxVolta = dia.volta.filter(p => p !== dia.condutor);
    const todosUnicos = [...new Set([...paxIda, ...paxVolta])];

    const celula = $(`gasoleo_${i}`);
    celula.innerHTML = '';

    if (!dia.condutor || todosUnicos.length === 0 || !custoPorSentido) {
      const vazio = document.createElement('span');
      vazio.className = 'status';
      vazio.textContent = '—';
      celula.appendChild(vazio);
      return;
    }

    const custoIda   = paxIda.length   > 0 ? custoPorSentido / (paxIda.length + 1)   : 0;
    const custoVolta = paxVolta.length > 0 ? custoPorSentido / (paxVolta.length + 1) : 0;

    const lines = document.createElement('div');
    lines.className = 'gasoleo-lines';

    todosUnicos.forEach(pessoa => {
      const naIda   = paxIda.includes(pessoa);
      const naVolta = paxVolta.includes(pessoa);
      const total   = (naIda ? custoIda : 0) + (naVolta ? custoVolta : 0);
      const detalhe = naIda && !naVolta ? '(só ida)' : (!naIda && naVolta ? '(só volta)' : '');

      // Acumular totais
      totais[pessoa] = (totais[pessoa] || 0) + total;

      const item = document.createElement('div');
      item.className = 'gasoleo-item';
      const nomeEl = document.createElement('span');
      nomeEl.className = 'gasoleo-nome';
      nomeEl.textContent = pessoa;
      const valWrap = document.createElement('span');
      const valEl = document.createElement('span');
      valEl.className = 'gasoleo-valor';
      valEl.textContent = total.toFixed(2) + ' €';
      valWrap.appendChild(valEl);
      if (detalhe) {
        const detEl = document.createElement('span');
        detEl.className = 'gasoleo-detalhe';
        detEl.textContent = ' ' + detalhe;
        valWrap.appendChild(detEl);
      }
      item.appendChild(nomeEl);
      item.appendChild(valWrap);
      lines.appendChild(item);
    });

    celula.appendChild(lines);
  });

  // Totais
  const grid = $('totaisGrid');
  grid.innerHTML = '';
  const entradas = Object.entries(totais);
  if (entradas.length === 0) {
    const vazio = document.createElement('span');
    vazio.className = 'status';
    vazio.textContent = 'Preenche a semana para ver os totais.';
    grid.appendChild(vazio);
  } else {
    entradas.forEach(([nome, total]) => {
      const item = document.createElement('div');
      item.className = 'total-item';
      const nomeEl = document.createElement('div');
      nomeEl.className = 'total-nome';
      nomeEl.textContent = nome;
      const valEl = document.createElement('div');
      valEl.className = 'total-valor';
      valEl.textContent = total.toFixed(2) + ' €';
      item.appendChild(nomeEl);
      item.appendChild(valEl);
      grid.appendChild(item);
    });
  }

  guardarDados();
}

// ── Limpar ──
function limparSemana() {
  if (!confirm('Limpar todos os dados da semana?')) return;
  semana = DIAS.map(() => ({ condutor: '', ida: [], volta: [], nota: '' }));
  renderSemana();
  calcularTudo();
}

// ── Copiar resumo ──
function copiarResumo() {
  const linhas = ['RESUMO BOLEIAS\n'];
  semana.forEach((dia, i) => {
    if (!dia.condutor) return;
    const gas = $(`gasoleo_${i}`).innerText.replace(/\n/g, ' | ');
    linhas.push(`${DIAS[i]}: ${dia.condutor} leva | Ida: ${dia.ida.join(', ')} | Volta: ${dia.volta.join(', ')} | ${gas}`);
  });

  const grid = $('totaisGrid');
  linhas.push('\nTOTAIS:');
  grid.querySelectorAll('.total-item').forEach(el => {
    linhas.push(`${el.querySelector('.total-nome').textContent}: ${el.querySelector('.total-valor').textContent}`);
  });

  navigator.clipboard.writeText(linhas.join('\n')).then(() => {
    alert('Resumo copiado!');
  }).catch((e) => {
    setStatus('precoStatus', 'Não foi possível copiar o resumo.', 'err');
    console.error('Falha ao copiar resumo', e);
  });
}

// ── Helper ──
function setStatus(id, msg, type) {
  const el = $(id);
  el.textContent = msg;
  el.className = 'status' + (type ? ' ' + type : '');
}
