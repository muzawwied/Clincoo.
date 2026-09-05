/**
 * Clincoo Project Management
 */

// Detect GitHub Pages subpath
const _isGHPages = window.location.pathname.includes('/Clincoo');
const _BASE = _isGHPages ? '/Clincoo.' : '';

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
}

function renderProjects() {
    const projects = getProjects();
    const homeList = document.getElementById('home-projects-list');
    const allList = document.getElementById('all-projects-list');

    function createHomeCard(proj) {
        const title = proj.aiName || proj.title || 'Proyek Tanpa Nama';
        const desc = proj.aiDesc || proj.prompt || '';
        return '<div class="w-56 sm:w-60 flex-shrink-0 border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group" onclick="openProject(\'' + proj.id + '\')">' +
            '<div class="w-full h-28 bg-[#F9FAFB] rounded-xl mb-3.5 p-3 flex flex-col justify-between border border-gray-100 group-hover:border-gray-200 transition-colors">' +
            '<div class="flex items-center justify-between"><div class="w-12 h-2 bg-gray-200 rounded-full"></div><div class="w-3 h-3 rounded-full bg-black/10"></div></div>' +
            '<div class="grid grid-cols-2 gap-2 my-auto"><div class="h-10 rounded-lg border border-gray-100 p-1.5 flex flex-col justify-between"><div class="w-6 h-1.5 bg-gray-200 rounded"></div><div class="w-10 h-2 bg-gray-900 rounded"></div></div><div class="h-10 rounded-lg border border-gray-100 p-1.5 flex flex-col justify-between"><div class="w-6 h-1.5 bg-gray-200 rounded"></div><div class="w-8 h-2 bg-gray-400 rounded"></div></div></div>' +
            '<div class="w-full h-1.5 bg-gray-200 rounded-full"></div></div>' +
            '<h3 class="font-semibold text-gray-900 text-sm group-hover:text-black truncate">' + title + '</h3>' +
            '<p class="text-[11px] text-gray-500 mt-0.5 truncate">' + desc.substring(0, 40) + '</p>' +
            '<p class="text-xs text-gray-400 mt-1.5">' + timeAgo(proj.updatedAt) + '</p></div>';
    }

    function createAllCard(proj) {
        const title = proj.aiName || proj.title || 'Proyek Tanpa Nama';
        const desc = proj.aiDesc || proj.prompt || '';
        return '<div class="w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group flex items-center gap-4" onclick="openProject(\'' + proj.id + '\')">' +
            '<div class="w-20 h-20 shrink-0 bg-[#F9FAFB] rounded-xl p-2.5 flex flex-col justify-between border border-gray-100 group-hover:border-gray-200 transition-colors">' +
            '<div class="w-full h-1.5 bg-gray-200 rounded-full"></div><div class="w-full h-1.5 bg-gray-200 rounded-full"></div><div class="w-full h-1.5 bg-gray-200 rounded-full"></div></div>' +
            '<div class="flex-1 min-w-0"><h3 class="font-semibold text-gray-900 text-base group-hover:text-black truncate">' + title + '</h3>' +
            '<p class="text-[13px] text-gray-500 mt-0.5 truncate">' + desc.substring(0, 60) + '</p>' +
            '<p class="text-sm text-gray-400 mt-1">' + timeAgo(proj.updatedAt) + '</p></div>' +
            '<div class="relative flex-shrink-0"><button class="p-2 text-gray-400 hover:text-black rounded-lg transition-colors" onclick="toggleOption(this, event)"><i data-lucide="more-vertical" class="w-5 h-5"></i></button>' +
            '<div class="option-popup absolute top-full right-0 mt-2 w-40 bg-white border border-gray-100 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.08)] py-2 opacity-0 invisible translate-y-2 transition-all duration-200 z-20 origin-top-right">' +
            '<button class="w-full text-left px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onclick="openProject(\'' + proj.id + '\')">Lanjutkan</button>' +
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

function deleteProject(id) {
    let projects = getProjects();
    projects = projects.filter(p => p.id !== id);
    saveProjects(projects);
    
    try {
        fetch('https://clincoo.pages.dev/api/activity', {
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
        localStorage.setItem('clincoo_projects', JSON.stringify(projects));
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
