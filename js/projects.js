// Escape HTML — wajib untuk semua data user/server sebelum masuk innerHTML (anti-XSS)
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/**
 * Clincoo Project Management
 */

// Detect GitHub Pages subpath
const _isGHPages = window.location.pathname.includes('/Clincoo');
const _BASE = _isGHPages ? '/Clincoo.' : '';

// === Sinkronisasi D1 per akun (Cloudflare) ===
// Token Bearer diinjeksi otomatis oleh js/auth-client.js pada semua call /api/.
const PROJECTS_API = (location.hostname.indexOf('github.io') !== -1 ? 'https://clincoo-be2.pages.dev/api' : '/api') + '/projects';
let _pushTimer = null;

function pushProjectsToServer(projects) {
    if (_pushTimer) clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () {
        try {
            fetch(PROJECTS_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'replace_all', projects: projects })
            }).catch(function () {});
        } catch (e) {}
    }, 700);
}

// Tarik daftar proyek milik akun dari D1; migrasi otomatis data lokal lama.
async function syncProjectsFromServer() {
    try {
        const res = await fetch(PROJECTS_API);
        if (!res.ok) return;
        const d = await res.json();
        const list = Array.isArray(d.projects) ? d.projects : [];
        const local = getProjects();
        if (list.length === 0 && local.length > 0) {
            // migrasi pertama: dorong proyek lokal ke akun yang login
            try {
                await fetch(PROJECTS_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'replace_all', projects: local })
                });
            } catch (e) {}
            return;
        }
        if (JSON.stringify(list) !== JSON.stringify(local)) {
            try { localStorage.setItem('clincoo_projects', JSON.stringify(list)); } catch (e) {}
            renderProjects();
        }
    } catch (e) {}
}

function toggleOption(btn, event) {
    event.preventDefault();
    event.stopPropagation();
    document.querySelectorAll('.option-popup').forEach(popup => {
        if (popup !== btn.nextElementSibling) {
            popup.classList.remove('opacity-100', 'visible', 'translate-y-0');
            popup.classList.add('opacity-0', 'invisible', 'translate-y-2');
        }
    });
    const popup = btn.nextElementSibling;
    if (popup.classList.contains('opacity-100')) {
        popup.classList.remove('opacity-100', 'visible', 'translate-y-0');
        popup.classList.add('opacity-0', 'invisible', 'translate-y-2');
    } else {
        popup.classList.remove('opacity-0', 'invisible', 'translate-y-2');
        popup.classList.add('opacity-100', 'visible', 'translate-y-0');
    }
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return 'Diperbarui ' + days + ' hari lalu';
    if (hours > 0) return 'Diperbarui ' + hours + ' jam lalu';
    return 'Diperbarui baru saja';
}

function getProjects() {
    let projects = [];
    try {
        const stored = localStorage.getItem('clincoo_projects');
        if (stored) projects = JSON.parse(stored);
    } catch(e) {}
    return projects;
}

function saveProjects(projects) {
    try { localStorage.setItem('clincoo_projects', JSON.stringify(projects)); } catch(e) {}
    pushProjectsToServer(projects); // simpan per akun di D1
}

function renderProjects() {
    const projects = getProjects();
    const homeList = document.getElementById('home-projects-list');
    const allList = document.getElementById('all-projects-list');

    function createHomeCard(proj) {
        const title = esc(proj.aiName || proj.title || 'Proyek Tanpa Nama');
        const desc = esc(proj.aiDesc || proj.prompt || '');
        return '<div class="w-56 sm:w-60 flex-shrink-0 border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group" onclick="openProject(\'' + esc(proj.id) + '\')">' +
            '<div class="w-full h-28 bg-[#F9FAFB] rounded-xl mb-3.5 p-3 flex flex-col justify-between border border-gray-100 group-hover:border-gray-200 transition-colors">' +
            '<div class="flex items-center justify-between"><div class="w-12 h-2 bg-gray-200 rounded-full"></div><div class="w-3 h-3 rounded-full bg-black/10"></div></div>' +
            '<div class="grid grid-cols-2 gap-2 my-auto"><div class="h-10 rounded-lg border border-gray-100 p-1.5 flex flex-col justify-between"><div class="w-6 h-1.5 bg-gray-200 rounded"></div><div class="w-10 h-2 bg-gray-900 rounded"></div></div><div class="h-10 rounded-lg border border-gray-100 p-1.5 flex flex-col justify-between"><div class="w-6 h-1.5 bg-gray-200 rounded"></div><div class="w-8 h-2 bg-gray-400 rounded"></div></div></div>' +
            '<div class="w-full h-1.5 bg-gray-200 rounded-full"></div></div>' +
            '<h3 class="font-semibold text-gray-900 text-sm group-hover:text-black truncate">' + title + '</h3>' +
            '<p class="text-[11px] text-gray-500 mt-0.5 truncate">' + desc.substring(0, 40) + '</p>' +
            '<p class="text-xs text-gray-400 mt-1.5">' + timeAgo(proj.updatedAt) + '</p></div>';
    }

    function createAllCard(proj) {
        const title = esc(proj.aiName || proj.title || 'Proyek Tanpa Nama');
        const desc = esc(proj.aiDesc || proj.prompt || '');
        return '<div class="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group flex items-center gap-4" onclick="openProject(\'' + esc(proj.id) + '\')">' +
            '<div class="w-20 h-20 shrink-0 bg-[#F9FAFB] rounded-xl p-2.5 flex flex-col justify-between border border-gray-100 group-hover:border-gray-200 transition-colors">' +
            '<div class="w-full h-1.5 bg-gray-200 rounded-full"></div><div class="w-full h-1.5 bg-gray-200 rounded-full"></div><div class="w-full h-1.5 bg-gray-200 rounded-full"></div></div>' +
            '<div class="flex-1 min-w-0"><h3 class="font-semibold text-gray-900 text-base group-hover:text-black truncate">' + title + '</h3>' +
            '<p class="text-[13px] text-gray-500 mt-0.5 truncate">' + desc.substring(0, 60) + '</p>' +
            '<p class="text-sm text-gray-400 mt-1">' + timeAgo(proj.updatedAt) + '</p></div>' +
            '<div class="relative flex-shrink-0"><button class="p-2 text-gray-400 hover:text-black rounded-lg transition-colors" onclick="toggleOption(this, event)"><i data-lucide="more-vertical" class="w-5 h-5"></i></button>' +
            '<div class="option-popup absolute top-full right-0 mt-2 w-40 bg-white border border-gray-100 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.08)] py-2 opacity-0 invisible translate-y-2 transition-all duration-200 z-20 origin-top-right">' +
            '<button class="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onclick="openProject(\'' + esc(proj.id) + '\')">Lanjutkan</button>' +
            '<button class="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onclick="duplicateProject(\'' + proj.id + '\')">Duplikat</button>' +
            '<button class="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onclick="shareProject(\'' + proj.id + '\')">Bagikan</button>' +
            '<button class="w-full text-left px-4 py-2 text-sm font-medium text-red-600 hover:bg-gray-50 transition-colors" onclick="deleteProject(\'' + proj.id + '\')">Hapus</button>' +
            '</div></div></div>';
    }

    if (homeList) {
        if (projects.length === 0) {
            homeList.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center w-full">Belum ada proyek. Buat proyek baru untuk memulai!</p>';
        } else {
            homeList.innerHTML = projects.slice(0, 6).map(createHomeCard).join('');
        }
    }
    if (allList) {
        if (projects.length === 0) {
            allList.innerHTML = '<p class="text-sm text-gray-400 py-8 text-center w-full">Belum ada proyek. Buat proyek baru untuk memulai!</p>';
        } else {
            allList.innerHTML = projects.map(createAllCard).join('');
        }
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openProject(id) {
    const projects = getProjects();
    const proj = projects.find(p => p.id === id);
    if (proj) {
        localStorage.setItem('clincoo_current_chat_msg', proj.prompt || '');
        localStorage.setItem('clincoo_current_project_id', id);
        if (_isGHPages) {
            window.location.href = _BASE + '/proyek/workspace.html?id=' + encodeURIComponent(id);
        } else {
            window.location.href = _BASE + '/workspace/' + id;
        }
    }
}

// Popup konfirmasi hapus proyek (CTA teks saja, radius kecil) — disuntik sekali per halaman
function _ensureDeleteModal() {
    if (document.getElementById('confirm-delete-modal')) return;
    const div = document.createElement('div');
    div.innerHTML =
        '<div id="confirm-delete-modal" class="fixed inset-0 z-[80] hidden items-center justify-center p-4" style="background:rgba(0,0,0,0.45)">' +
        '<div class="bg-white rounded-md w-full max-w-xs px-5 pt-5 pb-4 text-center">' +
        '<h3 class="text-base font-semibold text-gray-900">Hapus proyek ini?</h3>' +
        '<p id="confirm-delete-name" class="text-sm text-gray-500 mt-1 px-2 truncate"></p>' +
        '<p class="text-[13px] text-gray-400 mt-2 leading-snug">Semua data proyek akan dihapus, <span class="text-gray-500">termasuk situs yang sudah dipublish dan link publiknya</span>.</p>' +
        '<div class="flex items-center justify-center gap-10 mt-5">' +
        '<button type="button" id="confirm-delete-cancel" class="text-sm font-medium text-gray-400 hover:text-gray-900 transition-colors px-1 py-0.5">Batal</button>' +
        '<button type="button" id="confirm-delete-ok" class="text-sm font-semibold text-red-600 hover:text-red-700 transition-colors px-1 py-0.5">Hapus</button>' +
        '</div></div></div>';
    document.body.appendChild(div.firstElementChild);
    const modal = document.getElementById('confirm-delete-modal');
    modal.addEventListener('click', function (e) { if (e.target === modal) _closeDeleteModal(); });
    document.getElementById('confirm-delete-cancel').addEventListener('click', _closeDeleteModal);
    document.getElementById('confirm-delete-ok').addEventListener('click', function () {
        const id = _pendingDeleteId;
        _closeDeleteModal();
        if (id) _doDeleteProject(id);
    });
}
function _closeDeleteModal() {
    const modal = document.getElementById('confirm-delete-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    _pendingDeleteId = null;
}
let _pendingDeleteId = null;
function deleteProject(id) {
    _ensureDeleteModal();
    const proj = getProjects().find(p => p.id === id);
    _pendingDeleteId = id;
    const nameEl = document.getElementById('confirm-delete-name');
    if (nameEl) nameEl.textContent = (proj && (proj.aiName || proj.title)) ? '"' + esc(proj.aiName || proj.title) + '"' : 'Proyek ini';
    const modal = document.getElementById('confirm-delete-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
async function _doDeleteProject(id) {
    // tarik publish-an: situs + link publik (Cloudflare Pages) ikut dihapus
    const tok = (function () { try { return localStorage.getItem('clincoo_auth_token') || ''; } catch (e) { return ''; } })();
    const hdrs = { 'Content-Type': 'application/json' };
    if (tok) hdrs['Authorization'] = 'Bearer ' + tok;
    const apiRoot = PROJECTS_API.replace(/\/projects$/, '');
    try { await fetch(apiRoot + '/deploy', { method: 'POST', headers: hdrs, body: JSON.stringify({ project_id: id, action: 'unpublish' }) }); } catch (e) {}
    try { await fetch(PROJECTS_API, { method: 'POST', headers: hdrs, body: JSON.stringify({ action: 'delete', id: id }) }); } catch (e) {}

    // data lokal proyek (chat, file workspace, penunjuk aktif)
    try {
        localStorage.removeItem('clincoo_ls_chat_' + id);
        localStorage.removeItem('clincoo_workspace_files_' + id);
        if (localStorage.getItem('clincoo_current_project_id') === id) localStorage.removeItem('clincoo_current_project_id');
    } catch (e) {}

    let projects = getProjects();
    projects = projects.filter(p => p.id !== id);
    try { localStorage.setItem('clincoo_projects', JSON.stringify(projects)); } catch (e) {}

    try {
        fetch('https://clincoo-be2.pages.dev/api/activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_project', details: 'Proyek dihapus' })
        }).catch(function(){});
    } catch(e) {}

    renderProjects();
}

function duplicateProject(id) {
    let projects = getProjects();
    const proj = projects.find(p => p.id === id);
    if (proj) {
        const copy = Object.assign({}, proj, { id: 'proj_' + Date.now(), title: proj.title + ' (Copy)', updatedAt: new Date().toISOString() });
        projects.unshift(copy);
        saveProjects(projects);
        renderProjects();
    }
}

function shareProject(id) {
    const projects = getProjects();
    const proj = projects.find(p => p.id === id);
    if (proj && navigator.share) {
        navigator.share({ title: proj.title, text: proj.prompt }).catch(function(){});
    }
}

function processPromptSubmission() {
    const mainPromptInput = document.getElementById('main-prompt-input');
    if (!mainPromptInput) return;
    const prompt = mainPromptInput.value.trim();
    if (!prompt) return;
    
    try {
        localStorage.removeItem('clincoo_current_chat_msg');
        localStorage.removeItem('clincoo_current_project_id');
        localStorage.removeItem('clincoo_current_attachments');
    } catch(e) {}
    
    const projectId = 'proj_' + Date.now();
    let titleParts = prompt.split(' ');
    let title = titleParts.slice(0, 4).join(' ');
    if (titleParts.length > 4) title += '...';
    
    const newProject = { id: projectId, title: title, prompt: prompt, updatedAt: new Date().toISOString() };
    let projects = getProjects();
    projects.unshift(newProject);
    
    try {
        saveProjects(projects);
        localStorage.setItem('clincoo_current_chat_msg', prompt);
        localStorage.setItem('clincoo_current_project_id', projectId);
        const filePreviewContainer = document.getElementById('file-preview-container');
        const fileChips = filePreviewContainer ? filePreviewContainer.querySelectorAll('.file-chip') : [];
        if (fileChips.length > 0) {
            const attachments = Array.from(fileChips).map(function(chip) {
                const nameEl = chip.querySelector('span');
                return { name: nameEl ? nameEl.textContent : 'file', type: 'document' };
            });
            localStorage.setItem('clincoo_current_attachments', JSON.stringify(attachments));
        }
    } catch(e) {}
    if (_isGHPages) {
        window.location.href = _BASE + '/proyek/chat.html?id=' + encodeURIComponent(projectId);
    } else {
        window.location.href = _BASE + '/workspace/' + projectId + '/chat';
    }
}

// Sinkron dengan database per akun saat halaman dibuka
document.addEventListener('DOMContentLoaded', function () { syncProjectsFromServer(); });
if (document.readyState !== 'loading') syncProjectsFromServer();
