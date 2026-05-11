// ==UserScript==
// @name         Gestão de Lotações - EPROC
// @namespace    eproc-gestao-lotacoes
// @version      1.5
// @match        *://*.jus.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function normalizar(txt) {
        return txt
            .toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/^[A-Z0-9]+ - /g, "")
            .replace(/VARA DA |VARA DO |VARA DE /g, "")
            .replace(/JUIZADO ESPECIAL /g, "")
            .replace(/COMARCA DE /g, "")
            .replace(/DA COMARCA DE /g, "")
            .replace(/POSTO POLICIA MILITAR /g, "")
            .replace(/-/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizarBusca(txt) {
        return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function buscaInteligente(texto, busca) {
        const palavras = normalizarBusca(busca).split(/\s+/).filter(Boolean);
        return palavras.every(p => normalizarBusca(texto).includes(p));
    }

    // ==============================
    // HISTÓRICO (sessionStorage)
    // ==============================
    function getHistorico() {
        return JSON.parse(sessionStorage.getItem("EPROC_HIST") || "[]");
    }
    function getPosicao() {
        return parseInt(sessionStorage.getItem("EPROC_HIST_POS") ?? "-1");
    }
    function salvarHistorico(hist, pos) {
        sessionStorage.setItem("EPROC_HIST", JSON.stringify(hist));
        sessionStorage.setItem("EPROC_HIST_POS", String(pos));
    }
    function registrarLotacao(value, text) {
        let hist = getHistorico();
        let pos  = getPosicao();
        if (pos < hist.length - 1) hist = hist.slice(0, pos + 1);
        if (hist[pos]?.value === value) return;
        hist.push({ value, text });
        if (hist.length > 10) hist.shift();
        pos = hist.length - 1;
        salvarHistorico(hist, pos);
    }
    function atualizarBotoesNav() {
        const hist = getHistorico();
        const pos  = getPosicao();
        const btnV = document.getElementById("eproc-nav-voltar");
        const btnA = document.getElementById("eproc-nav-avancar");
        if (!btnV || !btnA) return;
        const temAnterior = pos > 0;
        const temProximo  = pos < hist.length - 1;
        btnV.style.display = temAnterior ? "inline-flex" : "none";
        btnA.style.display = temProximo  ? "inline-flex" : "none";
        btnV.title = temAnterior ? `Voltar: ${hist[pos - 1].text}` : "";
        btnA.title = temProximo  ? `Avançar: ${hist[pos + 1].text}` : "";
    }
    function navegarPara(select, novaPos, value) {
        const hist = getHistorico();
        salvarHistorico(hist, novaPos); // salva posição ANTES do reload
        sessionStorage.setItem("EPROC_NAVEGANDO", "1");
        select.value = value;
        if (typeof mudarPerfil === "function") {
            mudarPerfil(select);
        } else {
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    // ==============================
    // SVGs
    // ==============================
    const SVG_ADM = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="7" r="3"/>
        <path d="M3 20c0-4 2.7-7 6-7h1"/>
        <circle cx="17.5" cy="16.5" r="2"/>
        <path d="M17.5 13.5v1m0 4v1m2.6-4.5-.7.7m-3.8 3.8-.7.7m4.5 0-.7-.7m-3.8-3.8-.7-.7m-1 3H13m9 0h-1"/>
    </svg>`;
    const SVG_VOLTAR  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    const SVG_AVANCAR = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

    // ==============================
    // MÓDULO 1 — BUSCA DE LOTAÇÃO (HEADER)
    // ==============================
    function atualizarTextoCompleto(select) {
        Array.from(select.options).forEach(opt => {
            const title = opt.getAttribute("title");
            if (title && opt.text !== title) opt.text = title;
        });
    }

    let _uiCriada = false;

    setInterval(() => {
        const select = document.querySelector("#selInfraUnidades");
        if (!select) return;
        if (_uiCriada) return;
        _uiCriada = true;

        atualizarTextoCompleto(select);

        // Registra lotação atual ao carregar
        const opt = select.options[select.selectedIndex];
        if (opt) {
            const foiNavegacao = sessionStorage.getItem("EPROC_NAVEGANDO") === "1";
            sessionStorage.removeItem("EPROC_NAVEGANDO");
            if (!foiNavegacao) {
                registrarLotacao(opt.value, opt.text);
            }
            // Se foi navegação, não registra — posição já foi salva antes do reload
        }

        const alturaSelect = select.offsetHeight || 28;
        const ESTILO_BTN = `
            display:inline-flex;align-items:center;justify-content:center;
            padding:4px 6px;cursor:pointer;
            border:1px solid #aaa;border-radius:4px;
            background:#e3f2fd;color:#0d47a1;
            vertical-align:middle;
            height:${alturaSelect}px;box-sizing:border-box;
        `;

        // Campo de busca
        const container = document.createElement("span");
        container.id = "eproc-busca-container";
        container.style = `display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin-right:4px`;

        const input = document.createElement("input");
        input.id = "buscaLotacao";
        input.placeholder = "🔎 Buscar lotação...";
        input.style = `
            width:180px;padding:4px;font-size:13px;
            border:1px solid #ccc;border-radius:4px;
            height:${alturaSelect}px;box-sizing:border-box;
            vertical-align:middle;
        `;
        input.addEventListener("input", function () {
            const termo = this.value;
            Array.from(select.options).forEach(opt => {
                opt.style.display = buscaInteligente(opt.text, termo) ? "" : "none";
            });
        });

        container.appendChild(input);
        select.parentNode.insertBefore(container, select);

        // Wrapper botões após select
        const wrapperPos = document.createElement("span");
        wrapperPos.style = "display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin-left:4px";

        const btnVoltar = document.createElement("button");
        btnVoltar.type = "button";
        btnVoltar.id = "eproc-nav-voltar";
        btnVoltar.innerHTML = SVG_VOLTAR;
        btnVoltar.style = ESTILO_BTN + "display:none;";
        btnVoltar.onclick = (e) => {
            e.preventDefault();
            const hist = getHistorico();
            const pos  = getPosicao();
            if (pos <= 0) return;
            navegarPara(select, pos - 1, hist[pos - 1].value);
        };

        const btnAvancar = document.createElement("button");
        btnAvancar.type = "button";
        btnAvancar.id = "eproc-nav-avancar";
        btnAvancar.innerHTML = SVG_AVANCAR;
        btnAvancar.style = ESTILO_BTN + "display:none;";
        btnAvancar.onclick = (e) => {
            e.preventDefault();
            const hist = getHistorico();
            const pos  = getPosicao();
            if (pos >= hist.length - 1) return;
            navegarPara(select, pos + 1, hist[pos + 1].value);
        };

        const btnAdmin = document.createElement("button");
        btnAdmin.type = "button";
        btnAdmin.innerHTML = SVG_ADM;
        btnAdmin.title = "Alternar para Administrador do Sistema";
        btnAdmin.style = ESTILO_BTN;
        btnAdmin.onclick = (e) => {
            e.preventDefault();
            const optAdmin = Array.from(select.options).find(opt =>
                normalizarBusca(opt.text).includes("administrador do sistema")
            );
            if (!optAdmin) { alert("Lotação 'Administrador do Sistema' não encontrada."); return; }
            registrarLotacao(optAdmin.value, optAdmin.text);
            const hist = getHistorico();
            const pos  = getPosicao();
            navegarPara(select, pos, optAdmin.value);
        };

        wrapperPos.appendChild(btnVoltar);
        wrapperPos.appendChild(btnAvancar);
        wrapperPos.appendChild(btnAdmin);
        select.after(wrapperPos);

        atualizarBotoesNav();
    }, 500);

    // ==============================
    // MÓDULOS 2 e 3 — só na tela de usuário
    // ==============================
    const href = window.location.href;
    if (!href.includes("controlador.php") || !href.includes("acao=usuario")) return;

    // --- INCLUIR ---
    const TAMANHO_LOTE = 10;

    function pegarTiposDisponiveis() {
        const select = document.querySelector("#selUsuarioTipo");
        if (!select) return [];
        return [...select.options]
            .filter(opt => opt.value && opt.text.trim())
            .map(opt => ({ value: opt.value, text: opt.text.trim() }));
    }

    function definirTipo(value) {
        const select = document.querySelector("#selUsuarioTipo");
        if (!select) return;
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        if (window.tratarTipo) window.tratarTipo();
    }

    function abrirSelect2() {
        const caixa = document.querySelector(
            "#divUsuarios > div.row > div.col-sm-5.pr-0 > span > span.selection > span"
        );
        if (!caixa) throw "Caixa de lotações não encontrada";
        caixa.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        caixa.click();
    }

    function pegarTodasLotacoes() {
        return [...document.querySelectorAll(".select2-container--open .select2-results__option")]
            .map(i => ({ value: i.id?.split("-").pop(), text: i.textContent.trim() }))
            .filter(i => i.text && i.value);
    }

    function adicionarNaLista(value, text) {
        const select = document.querySelector("#selLotacoesUsuario");
        if (!select) throw "Campo real de lotações não encontrado";
        if ([...select.options].some(o => o.value === value)) return;
        const opt = document.createElement("option");
        opt.value = value; opt.text = text; opt.selected = true;
        select.appendChild(opt);
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function lotacoesJaIncluidas() {
        const linhas = document.querySelectorAll("#tabelaUsuarios > tbody > tr");
        if (!linhas.length) return [];
        return [...linhas].map(tr => normalizar(tr.innerText || "")).filter(Boolean);
    }

    function criarModalTipo(tipos, onConfirmar) {
        const overlay = document.createElement("div");
        overlay.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center`;
        const box = document.createElement("div");
        box.style = `background:white;width:420px;padding:20px;border-radius:8px;font-family:Arial`;
        box.innerHTML = `
            <h3 style="margin:0 0 16px">Selecionar tipo de perfil</h3>
            <select id="selTipoPerfil" style="width:100%;padding:8px;font-size:14px;border:1px solid #ccc;border-radius:4px">
                <option value="">-- Selecione --</option>
                ${tipos.map(t => `<option value="${t.value}">${t.text}</option>`).join("")}
            </select>
            <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
                <button id="cancelarTipo" style="padding:8px 14px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:white">Cancelar</button>
                <button id="confirmarTipo" style="padding:8px 14px;background:#0d47a1;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold">Próximo →</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#cancelarTipo").onclick = () => overlay.remove();
        box.querySelector("#confirmarTipo").onclick = () => {
            const sel = box.querySelector("#selTipoPerfil");
            if (!sel.value) { alert("Selecione um tipo de perfil."); return; }
            overlay.remove();
            onConfirmar(sel.value);
        };
    }

    function criarUIIncluir(lotacoes) {
        const overlay = document.createElement("div");
        overlay.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999`;
        const box = document.createElement("div");
        box.style = `background:white;width:600px;max-height:80vh;margin:5vh auto;padding:15px;border-radius:8px;display:flex;flex-direction:column;font-family:Arial`;
        box.innerHTML = `
            <h3 style="margin:0 0 10px">Selecionar lotações</h3>
            <input id="filtroLot" placeholder="Filtrar..." style="padding:6px;margin-bottom:6px">
            <div style="margin-bottom:6px;display:flex;gap:6px;align-items:center">
                <button id="marcarTodos">Marcar todos</button>
                <button id="desmarcarTodos">Desmarcar todos</button>
                <span id="contadorSel" style="margin-left:auto;font-size:13px;color:#555"></span>
            </div>
            <div id="listaLot" style="overflow-y:auto;flex:1;border:1px solid #ccc;padding:6px;min-height:0"></div>
            <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
                <button id="cancelar" style="padding:8px 14px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:white">Cancelar</button>
                <button id="confirmar" style="background:#2e7d32;color:white;padding:8px 14px;border:none;border-radius:4px;cursor:pointer;font-weight:bold">Incluir selecionadas</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const listaDiv = box.querySelector("#listaLot");
        const contador = box.querySelector("#contadorSel");

        function atualizarContador() {
            const total    = listaDiv.querySelectorAll("input[type=checkbox]").length;
            const marcados = listaDiv.querySelectorAll("input:checked").length;
            contador.textContent = marcados > 0 ? `${marcados} de ${total} selecionadas` : `${total} disponíveis`;
        }

        function render(filtro = "") {
            listaDiv.innerHTML = "";
            const jaTenho = lotacoesJaIncluidas();
            const visiveis = lotacoes
                .filter(l => !jaTenho.includes(normalizar(l.text)))
                .filter(l => l.text.toLowerCase().includes(filtro.toLowerCase()));
            if (!visiveis.length) {
                listaDiv.innerHTML = `<p style="color:#888;font-size:13px">Nenhuma lotação disponível.</p>`;
                atualizarContador();
                return;
            }
            visiveis.forEach(l => {
                const d = document.createElement("div");
                d.innerHTML = `
                    <label style="display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer">
                        <input type="checkbox" value="${l.value}" data-text="${l.text}">
                        <span style="font-size:13px">${l.text}</span>
                    </label>
                `;
                d.querySelector("input").addEventListener("change", atualizarContador);
                listaDiv.appendChild(d);
            });
            atualizarContador();
        }

        render();
        box.querySelector("#filtroLot").oninput = e => render(e.target.value);
        box.querySelector("#marcarTodos").onclick   = () => { listaDiv.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = true);  atualizarContador(); };
        box.querySelector("#desmarcarTodos").onclick = () => { listaDiv.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false); atualizarContador(); };
        box.querySelector("#cancelar").onclick = () => overlay.remove();
        box.querySelector("#confirmar").onclick = async () => {
            const marcados = [...listaDiv.querySelectorAll("input:checked")];
            if (!marcados.length) { alert("Selecione ao menos uma lotação."); return; }
            box.querySelector("#confirmar").disabled = true;
            box.querySelector("#confirmar").textContent = "Aguarde...";
            box.querySelector("#cancelar").disabled = true;
            for (let i = 0; i < marcados.length; i += TAMANHO_LOTE) {
                const lote = marcados.slice(i, i + TAMANHO_LOTE);
                lote.forEach(c => { try { adicionarNaLista(c.value, c.dataset.text); } catch (e) { console.error(e); } });
                if (i + TAMANHO_LOTE < marcados.length) await sleep(300);
            }
            const btnSalvar = document.querySelector("#btnIncUsu");
            if (btnSalvar) btnSalvar.click();
            overlay.remove();
            alert(`✅ ${marcados.length} lotações enviadas para inclusão.`);
        };
    }

    async function iniciarInclusao() {
        try {
            const tipos = pegarTiposDisponiveis();
            if (!tipos.length) { alert("❌ Nenhum tipo de perfil encontrado."); return; }
            criarModalTipo(tipos, async (tipoValue) => {
                try {
                    definirTipo(tipoValue);
                    await sleep(1500);
                    abrirSelect2();
                    await sleep(800);
                    const lotacoes = pegarTodasLotacoes();
                    document.body.click();
                    const jaTenho = lotacoesJaIncluidas();
                    const filtradas = lotacoes.filter(l => {
                        const n = normalizar(l.text);
                        return !jaTenho.some(j => n.includes(j) || j.includes(n));
                    });
                    criarUIIncluir(filtradas);
                } catch (e) { console.error(e); alert("❌ " + e); }
            });
        } catch (e) { console.error(e); alert("❌ " + e); }
    }

    // --- EXCLUIR ---
    window.confirm = () => true;
    window.alert = () => {};

    function pegarLotacoesAtuais() {
        const linhas = document.querySelectorAll("#tabelaUsuarios > tbody > tr");
        return [...linhas].map(tr => {
            const tds = tr.querySelectorAll("td");
            const lotacao    = tds[2]?.innerText?.trim();
            const perfil     = tds[3]?.innerText?.trim();
            const btnExcluir = tr.querySelector("img[src*='desativar_vermelho.gif']");
            return { lotacao, perfil, btnExcluir };
        }).filter(l => l.lotacao && l.perfil && l.btnExcluir);
    }

    function excluirSequencial(lotacoes) {
        localStorage.setItem("EPROC_EXCLUIR", JSON.stringify(lotacoes.map(l => ({ lotacao: l.lotacao, perfil: l.perfil }))));
        localStorage.setItem("EPROC_EXCLUIR_TOTAL", lotacoes.length);
        localStorage.setItem("EPROC_EXCLUIR_CONCLUIDAS", JSON.stringify([]));
        setTimeout(excluirProxima, 300);
    }

    function excluirProxima() {
        const lista      = JSON.parse(localStorage.getItem("EPROC_EXCLUIR") || "[]");
        const total      = parseInt(localStorage.getItem("EPROC_EXCLUIR_TOTAL") || "0");
        const concluidas = JSON.parse(localStorage.getItem("EPROC_EXCLUIR_CONCLUIDAS") || "[]");

        if (!lista.length) {
            localStorage.removeItem("EPROC_EXCLUIR");
            localStorage.removeItem("EPROC_EXCLUIR_TOTAL");
            localStorage.removeItem("EPROC_EXCLUIR_CONCLUIDAS");
            mostrarProgresso(total, total, concluidas, null, true);
            return;
        }

        const item   = lista.shift();
        const feitas = total - lista.length - 1;
        localStorage.setItem("EPROC_EXCLUIR", JSON.stringify(lista));
        mostrarProgresso(feitas, total, concluidas, item.lotacao, false);

        const linhas = document.querySelectorAll("#tabelaUsuarios > tbody > tr");
        for (const tr of linhas) {
            if (tr.innerText.includes(item.lotacao)) {
                const btn = tr.querySelector("img[src*='desativar_vermelho.gif']");
                if (btn) {
                    concluidas.push(item.lotacao);
                    localStorage.setItem("EPROC_EXCLUIR_CONCLUIDAS", JSON.stringify(concluidas));
                    btn.click();
                    return;
                }
            }
        }
        excluirProxima();
    }

    function mostrarProgresso(feitas, total, concluidas, atual, finalizado) {
        document.getElementById("eproc-progresso-overlay")?.remove();
        const overlay = document.createElement("div");
        overlay.id = "eproc-progresso-overlay";
        overlay.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center`;
        const box = document.createElement("div");
        box.style = `background:white;width:500px;padding:20px;border-radius:8px;font-family:Arial`;
        const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
        box.innerHTML = `
            <h3 style="margin:0 0 14px;color:${finalizado ? '#2e7d32' : '#c62828'}">
                ${finalizado ? '✅ Exclusão concluída' : '⏳ Excluindo lotações...'}
            </h3>
            <div style="background:#eee;border-radius:4px;height:18px;overflow:hidden;margin-bottom:8px">
                <div style="height:100%;width:${pct}%;background:${finalizado ? '#2e7d32' : '#c62828'};border-radius:4px"></div>
            </div>
            <p style="margin:0 0 10px;font-size:13px;color:#555">
                ${feitas} de ${total} excluídas (${pct}%)
                ${!finalizado && atual ? `<br><span style="color:#333">Excluindo: <strong>${atual}</strong></span>` : ''}
            </p>
            ${concluidas.length ? `
                <div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:4px;padding:6px;font-size:12px;color:#444">
                    ${concluidas.map(n => `<div style="padding:2px 0;border-bottom:1px solid #f5f5f5">✓ ${n}</div>`).join('')}
                </div>
            ` : ''}
            ${finalizado ? `
                <div style="text-align:right;margin-top:14px">
                    <button id="fecharProgresso" style="padding:8px 16px;background:#2e7d32;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold">Fechar</button>
                </div>
            ` : ''}
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        if (finalizado) box.querySelector("#fecharProgresso").onclick = () => overlay.remove();
    }

    function criarUIExcluir(lotacoes) {
        const perfisUnicos = [...new Set(lotacoes.map(l => l.perfil))].sort();
        const overlay = document.createElement("div");
        overlay.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999999`;
        const box = document.createElement("div");
        box.style = `background:white;width:650px;max-height:80vh;margin:5vh auto;padding:15px;border-radius:8px;display:flex;flex-direction:column;font-family:Arial`;
        box.innerHTML = `
            <h3 style="margin:0 0 10px">Excluir lotações</h3>
            <div style="display:flex;gap:6px;margin-bottom:6px">
                <input id="filtroTexto" placeholder="Filtrar por lotação..." style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px">
                <select id="filtroPerfil" style="padding:6px;border:1px solid #ccc;border-radius:4px;min-width:180px">
                    <option value="">Todos os perfis</option>
                    ${perfisUnicos.map(p => `<option value="${p}">${p}</option>`).join("")}
                </select>
            </div>
            <div style="margin-bottom:6px;display:flex;gap:6px;align-items:center">
                <button id="selTodos">Marcar todos</button>
                <button id="deselTodos">Desmarcar todos</button>
                <span id="contador" style="margin-left:auto;font-size:13px;color:#555"></span>
            </div>
            <div id="listaExcluir" style="flex:1;overflow-y:auto;border:1px solid #ccc;padding:6px;min-height:0"></div>
            <div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
                <button id="cancelar" style="padding:8px 14px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:white">Cancelar</button>
                <button id="confirmar" style="background:#c62828;color:white;padding:8px 14px;border:none;border-radius:4px;cursor:pointer;font-weight:bold">Excluir selecionadas</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const listaDiv = box.querySelector("#listaExcluir");
        const contador = box.querySelector("#contador");

        function atualizarContador() {
            const total    = listaDiv.querySelectorAll("input[type=checkbox]").length;
            const marcados = listaDiv.querySelectorAll("input:checked").length;
            contador.textContent = marcados > 0 ? `${marcados} de ${total} selecionadas` : `${total} visíveis`;
        }

        function render() {
            const filtroTexto  = box.querySelector("#filtroTexto").value.toLowerCase();
            const filtroPerfil = box.querySelector("#filtroPerfil").value;
            listaDiv.innerHTML = "";
            const visiveis = lotacoes.filter(l => {
                const textoOk  = !filtroTexto  || l.lotacao.toLowerCase().includes(filtroTexto);
                const perfilOk = !filtroPerfil || l.perfil === filtroPerfil;
                return textoOk && perfilOk;
            });
            if (!visiveis.length) {
                listaDiv.innerHTML = `<p style="color:#888;font-size:13px">Nenhuma lotação encontrada.</p>`;
                atualizarContador();
                return;
            }
            visiveis.forEach(l => {
                const realIndex = lotacoes.indexOf(l);
                const d = document.createElement("div");
                d.innerHTML = `
                    <label style="display:flex;align-items:baseline;gap:6px;padding:3px 0;cursor:pointer">
                        <input type="checkbox" data-real-index="${realIndex}" style="margin-top:2px;flex-shrink:0">
                        <span style="font-size:13px">${l.lotacao} <span style="color:#777;font-size:12px">(${l.perfil})</span></span>
                    </label>
                `;
                d.querySelector("input").addEventListener("change", atualizarContador);
                listaDiv.appendChild(d);
            });
            atualizarContador();
        }

        render();
        box.querySelector("#filtroTexto").oninput   = render;
        box.querySelector("#filtroPerfil").onchange = render;
        box.querySelector("#selTodos").onclick   = () => { listaDiv.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = true);  atualizarContador(); };
        box.querySelector("#deselTodos").onclick = () => { listaDiv.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false); atualizarContador(); };
        box.querySelector("#cancelar").onclick = () => overlay.remove();
        box.querySelector("#confirmar").onclick = () => {
            const marcados = [...listaDiv.querySelectorAll("input:checked")]
                .map(c => lotacoes[c.dataset.realIndex]);
            if (!marcados.length) { alert("Nenhuma selecionada"); return; }
            if (!confirm(`Serão excluídas ${marcados.length} lotação(ões), uma por vez.\nO processo pode demorar. Deseja continuar?`)) return;
            overlay.remove();
            excluirSequencial(marcados);
        };
    }

    function iniciarExclusao() {
        const lotacoes = pegarLotacoesAtuais();
        if (!lotacoes.length) return alert("Nenhuma lotação encontrada");
        criarUIExcluir(lotacoes);
    }

    // ==============================
    // BOTÕES FLUTUANTES
    // ==============================
    const btnIncluir = document.createElement("button");
    btnIncluir.textContent = "Incluir lotações";
    btnIncluir.style = `position:fixed;bottom:20px;right:20px;z-index:99999;background:#0d47a1;color:white;border:none;padding:12px 18px;border-radius:6px;font-weight:bold;cursor:pointer`;
    btnIncluir.onclick = iniciarInclusao;
    document.body.appendChild(btnIncluir);

    const btnExcluir = document.createElement("button");
    btnExcluir.textContent = "Excluir lotações";
    btnExcluir.style = `position:fixed;bottom:70px;right:20px;z-index:99999;background:#c62828;color:white;border:none;padding:12px 18px;border-radius:6px;font-weight:bold;cursor:pointer`;
    btnExcluir.onclick = iniciarExclusao;
    document.body.appendChild(btnExcluir);

    if (localStorage.getItem("EPROC_EXCLUIR")) {
        setTimeout(() => {
            if (document.querySelector("#tabelaUsuarios > tbody > tr")) excluirProxima();
        }, 2000);
    }

})();