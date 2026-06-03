// eproc-utils.js — Utilitários compartilhados entre os scripts eProc TJSP
// NÃO contém cabeçalho ==UserScript==
// Carregado via @require nos scripts que precisam:
//   // @require https://raw.githubusercontent.com/rsalvessap/eproc-scripts-gerais/master/shared/eproc-utils.js
//
// Expõe o objeto global EprocUtils no escopo do Tampermonkey.

/* globals GM_getValue, GM_setValue, GM_deleteValue */

(function (global) {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // FORMATAÇÃO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Formata milissegundos em string legível: "1h 23m 45s" ou "45s"
     */
    function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0)  return `${h}h ${m % 60}m ${s % 60}s`;
        if (m > 0)  return `${m}m ${s % 60}s`;
        return `${s}s`;
    }

    /**
     * Formata timestamp Unix em "DD/MM HH:MM"
     */
    function formatDateTime(ts) {
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /**
     * Calcula velocidade de processamento: "X proc/min"
     */
    function calcRate(done, startedAt) {
        const elapsed = (Date.now() - startedAt) / 60000; // minutos
        if (elapsed < 0.1 || done === 0) return '—';
        return `${(done / elapsed).toFixed(1)} proc/min`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTAÇÃO DE ARQUIVOS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Faz download de um arquivo de texto no navegador.
     * @param {string} content  - Conteúdo do arquivo
     * @param {string} filename - Nome do arquivo (ex: "relatorio.txt")
     * @param {string} [mime]   - MIME type (padrão: text/plain;charset=utf-8)
     */
    function downloadText(content, filename, mime = 'text/plain;charset=utf-8') {
        const blob = new Blob([content], { type: mime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Faz download de um arquivo CSV.
     * @param {string[][]} rows - Array de linhas (cada linha é array de células)
     * @param {string}     filename
     */
    function downloadCSV(rows, filename) {
        const escape = cell => `"${String(cell).replace(/"/g, '""')}"`;
        const content = rows.map(row => row.map(escape).join(',')).join('\r\n');
        downloadText(content, filename, 'text/csv;charset=utf-8');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HUD — DRAGGABLE & COLLAPSIBLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Torna um elemento arrastável pelo seu handle.
     * @param {HTMLElement} el           - Elemento a mover
     * @param {HTMLElement} handleEl     - Elemento que captura o drag (ex: header)
     * @param {HTMLElement} [excludeEl]  - Elemento filho que NÃO deve iniciar drag (ex: botão toggle)
     */
    function makeDraggable(el, handleEl, excludeEl) {
        let dragging = false, ox = 0, oy = 0;

        handleEl.addEventListener('mousedown', e => {
            if (excludeEl && excludeEl.contains(e.target)) return;
            dragging = true;
            ox = e.clientX - el.offsetLeft;
            oy = e.clientY - el.offsetTop;
            el.style.transition = 'none';
            el.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            el.style.left   = (e.clientX - ox) + 'px';
            el.style.top    = (e.clientY - oy) + 'px';
            el.style.right  = 'auto';
            el.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            dragging = false;
            el.style.userSelect = '';
        });
    }

    /**
     * Adiciona comportamento de colapso/expansão.
     * @param {HTMLElement} toggleBtn - Botão que alterna
     * @param {HTMLElement} bodyEl    - Elemento a esconder/mostrar
     * @param {string} [classCollapsed] - Classe CSS para estado colapsado
     */
    function makeCollapsible(toggleBtn, bodyEl, classCollapsed = 'collapsed') {
        toggleBtn.addEventListener('click', () => {
            bodyEl.classList.toggle(classCollapsed);
            toggleBtn.textContent = bodyEl.classList.contains(classCollapsed) ? '+' : '−';
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BARRA DE PROGRESSO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna HTML string de uma barra de progresso.
     * @param {number} current
     * @param {number} total
     * @param {string} [color] - Cor CSS da barra (padrão: #48bb78)
     */
    function progressBarHTML(current, total, color = '#48bb78') {
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        return `
            <div style="background:#2d3748;border-radius:4px;height:10px;overflow:hidden;margin:6px 0">
                <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width 0.3s"></div>
            </div>
            <div style="font-size:11px;color:#a0aec0;text-align:right">${current}/${total} (${pct}%)</div>
        `;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STORAGE HELPERS (GM_getValue / GM_setValue)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lê um valor JSON do storage GM (com fallback seguro).
     * @param {string} key
     * @param {*}      defaultValue
     */
    function gmGet(key, defaultValue = null) {
        try {
            const raw = GM_getValue(key, null);
            return raw === null ? defaultValue : JSON.parse(raw);
        } catch {
            return defaultValue;
        }
    }

    /**
     * Salva um valor serializado como JSON no storage GM.
     * @param {string} key
     * @param {*}      value
     */
    function gmSet(key, value) {
        GM_setValue(key, JSON.stringify(value));
    }

    /**
     * Remove uma chave do storage GM.
     * @param {string} key
     */
    function gmDel(key) {
        GM_deleteValue(key);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NÚMERO DE PROCESSO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Formata 20 dígitos no padrão CNJ: 0000000-00.0000.0.00.0000
     * @param {string} digits - String de 20 dígitos
     * @returns {string|null}
     */
    function formatProcessNumber(digits) {
        const d = digits.replace(/\D/g, '');
        if (d.length !== 20) return null;
        return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16,20)}`;
    }

    /**
     * Extrai e formata todos os números de processo de um texto (um por linha).
     * @param {string} text
     * @returns {string[]}
     */
    function parseProcessNumbers(text) {
        return text
            .split(/\n/)
            .map(l => l.trim().replace(/\D/g, ''))
            .filter(d => d.length === 20)
            .map(formatProcessNumber)
            .filter(Boolean);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTAÇÃO
    // ─────────────────────────────────────────────────────────────────────────

    global.EprocUtils = {
        formatTime,
        formatDateTime,
        calcRate,
        downloadText,
        downloadCSV,
        makeDraggable,
        makeCollapsible,
        progressBarHTML,
        gmGet,
        gmSet,
        gmDel,
        formatProcessNumber,
        parseProcessNumbers,
    };

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
