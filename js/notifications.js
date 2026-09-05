/**
 * Clincoo Notifications System
 * Real-time D1-backed notifications with page links
 */
const NOTIF_API = 'https://clincoo-be2.pages.dev/api/notifications';
const NOTIF_KEY = 'clincoo_notifications';
const NOTIF_ALLOWED = ['GitHub', 'Workspace', 'Deploy', 'Akun'];
function isAllowedNotif(n) { return NOTIF_ALLOWED.indexOf(String((n && n.source) || '')) > -1; }
function getLocalNotifs() { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]').filter(isAllowedNotif); } catch(e) { return []; } }
let d1Notifs = [];
let d1UnreadCount = 0;

const notifIcons = {
    security: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />',
    login: '<path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />',
    settings: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />',
    deploy: '<path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />',
    maintenance: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />',
    wallet: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />',
    subscription: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />',
    project: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />',
    info: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />'
};

const notifColors = {
    security: '#ef4444',
    login: '#3b82f6',
    settings: '#6366f1',
    deploy: '#10b981',
    maintenance: '#f59e0b',
    wallet: '#f59e0b',
    subscription: '#8b5cf6',
    project: '#06b6d4',
    info: '#6b7280'
};

async function fetchD1Notifications() {
    try {
        await fetch(NOTIF_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_read' }) });
        const res = await fetch(NOTIF_API);
        if (!res.ok) return;
        const data = await res.json();
        const apiNotifs = (data.notifications || []).filter(isAllowedNotif);
        const local = getLocalNotifs();
        const seen = {}; const merged = [];
        apiNotifs.concat(local).forEach(function(n) { const k = String(n.id); if (!seen[k]) { seen[k] = true; merged.push(n); } });
        merged.sort(function(a, b) { return new Date(b.created_at || b.timestamp || 0) - new Date(a.created_at || a.timestamp || 0); });
        d1Notifs = merged;
        d1UnreadCount = merged.filter(function(n) { return !n.read; }).length;
        renderBellBadge();
        renderNotifDropdown();
        renderNotifPage();
    } catch(e) {}
}

function renderBellBadge() {
    const notifBtn = document.getElementById('notif-btn');
    if (!notifBtn) return;
    let badge = notifBtn.querySelector('.notif-badge');
    if (d1UnreadCount > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notif-badge absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center';
            notifBtn.style.position = 'relative';
            notifBtn.appendChild(badge);
        }
        badge.textContent = d1UnreadCount > 9 ? '9+' : d1UnreadCount;
    } else if (badge) {
        badge.remove();
    }
}

function renderNotifDropdown() {
    const notifMenu = document.getElementById('notif-menu');
    if (!notifMenu) return;
    const contentArea = notifMenu.querySelector('.notif-dropdown-content');
    if (!contentArea) return;
    if (d1Notifs.length === 0) {
        contentArea.innerHTML = '<div class="text-xs text-gray-500 text-center py-5">Belum ada notifikasi baru</div>';
        return;
    }
    let html = '<div class="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">';
    for (let n of d1Notifs.slice(0, 5)) {
        let timeStr = new Date(n.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const type = n.type || 'info';
        const iconPath = notifIcons[type] || notifIcons.info;
        const color = notifColors[type] || notifColors.info;
        html += '<div class="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer' + (n.read ? ' opacity-60' : '') + '" onclick="handleNotifClick(' + n.id + ')">' +
            '<div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style="background:' + color + '15"><svg class="w-3.5 h-3.5" style="color:' + color + '" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">' + iconPath + '</svg></div>' +
            '<div class="flex-1 min-w-0"><p class="text-xs text-gray-600">' + n.message + '</p>' +
            '<div class="flex items-center gap-1.5 mt-0.5"><span class="text-[10px] font-medium" style="color:' + color + '">' + (n.source || '') + '</span>' +
            '<span class="text-[10px] text-gray-400">' + timeStr + '</span></div></div></div>';
    }
    html += '</div>';
    contentArea.innerHTML = html;
}

function renderNotifPage() {
    const notifList = document.getElementById('notif-full-list');
    if (!notifList) return;
    if (d1Notifs.length === 0) {
        notifList.innerHTML = '<div class="text-center py-12"><p class="text-[15px] text-gray-500">Belum ada notifikasi baru</p></div>';
        return;
    }
    let html = '<div class="space-y-3 mt-4">';
    for (let n of d1Notifs) {
        let timeStr = new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        const type = n.type || 'info';
        const iconPath = notifIcons[type] || notifIcons.info;
        const color = notifColors[type] || notifColors.info;
        html += '<div class="flex items-start gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100 cursor-pointer hover:shadow-sm transition-shadow' + (n.read ? ' opacity-60' : '') + '" onclick="handleNotifClick(' + n.id + ')">' +
            '<div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background:' + color + '15"><svg class="w-4 h-4" style="color:' + color + '" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">' + iconPath + '</svg></div>' +
            '<div class="flex-1"><div class="flex items-center gap-2"><span class="text-sm font-semibold" style="color:' + color + '">' + (n.source || '') + '</span>' +
            '<span class="text-xs text-gray-400">' + timeStr + '</span></div>' +
            '<p class="text-sm text-gray-600 mt-0.5 line-clamp-2">' + n.message + '</p>' +
            (n.link ? '<p class="text-xs text-blue-500 mt-1">Lihat detail \u2192</p>' : '') + '</div></div>';
    }
    html += '</div>';
    notifList.innerHTML = html;
}

async function markNotifRead(id) {
    try {
        await fetch(NOTIF_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_read', id }) });
        fetchD1Notifications();
    } catch(e) {}
}

async function markAllNotifsRead() {
    try {
        await fetch(NOTIF_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_all_read' }) });
        await fetch(NOTIF_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear_read' }) });
        fetchD1Notifications();
    } catch(e) {}
}

function handleNotifClick(id) {
    const n = d1Notifs.find(x => x.id === id);
    if (!n) return;
    if (!n.read) markNotifRead(n.id);
    if (n.link) { window.location.href = n.link; }
}

function createLoginNotification() {
    try {
        var today = new Date().toISOString().slice(0, 10);
        var lastLogin = localStorage.getItem('clincoo_last_login_notif');
        if (lastLogin !== today) {
            localStorage.setItem('clincoo_last_login_notif', today);
            var userAgent = navigator.userAgent;
            var device = /Mobile|Android|iPhone/.test(userAgent) ? 'Perangkat Mobile' : 'Desktop';
            var browser = /Chrome/.test(userAgent) ? 'Chrome' : /Firefox/.test(userAgent) ? 'Firefox' : /Safari/.test(userAgent) ? 'Safari' : 'Browser';
            fetch(NOTIF_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'Akun', message: 'Login berhasil dari ' + device + ' (' + browser + ')', type: 'login', link: '' })
            }).then(function() { setTimeout(fetchD1Notifications, 1500); });
        }
    } catch(e) {}
}

if (typeof window !== 'undefined') {
    try { var _pn = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); var _pk = _pn.filter(isAllowedNotif); if (_pk.length !== _pn.length) localStorage.setItem(NOTIF_KEY, JSON.stringify(_pk)); } catch(e) {}
    fetchD1Notifications();
    setInterval(fetchD1Notifications, 30000);
    createLoginNotification();
}
