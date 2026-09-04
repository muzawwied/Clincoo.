// Cloudflare Pages Functions - Chat Backend (D1-backed)
// Persists all messages to D1. Uses client-provided messages array for Gemini context
// (preserves system instructions, external context from Jina search/URL reading).

const PREFERRED_MODELS = [
  "gemini-3.6-flash",
  "gemini-3-flash-preview"
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

async function getApiKey(env) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind('GEMINI_API_KEY').first();
    return row?.value || null;
  } catch {
    return null;
  }
}

function dataUrlToInlineData(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function partsFromContent(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (!block) continue;
      if (block.type === 'text' && block.text) parts.push({ text: block.text });
      else if (block.type === 'image_url' && block.image_url?.url) {
        const inline = dataUrlToInlineData(block.image_url.url);
        if (inline) parts.push(inline);
      }
      else if (block.type === 'function_call' && block.name) {
        parts.push({ functionCall: { name: block.name, args: block.args || {} } });
      }
      else if (block.type === 'function_response' && block.name) {
        parts.push({ functionResponse: { name: block.name, response: { result: block.result } } });
      }
    }
    return parts.length > 0 ? parts : [{ text: '.' }];
  }
  return [{ text: String(content || '.') }];
}

function buildServerSystemInstruction() {
  let now = '';
  try {
    now = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short'
    }).format(new Date());
  } catch { now = new Date().toISOString(); }
  return [
    'Kamu adalah Clincoo, asisten AI milik platform deployment Clincoo.',
    'Selalu balas dalam Bahasa Indonesia yang natural dan ramah, kecuali user memakai bahasa lain.',
    'Format jawaban pakai Markdown (heading, list, tabel, blok kode) supaya rapi di UI chat.',
    'Untuk pertanyaan coding: berikan kode lengkap dan siap pakai dalam blok kode dengan bahasa yang sesuai.',
    'Jika tidak yakin atau informasinya kurang, katakan dengan jujur — jangan mengarang.',
    'Waktu saat ini: ' + now + ' WIB. Gunakan ini untuk pertanyaan tanggal, jadwal, dan waktu.'
  ].join('\n');
}

function toGeminiPayload(messages, useWorkspaceTools) {
  let systemInstruction = null;
  const contents = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role === 'system') {
      const text = typeof m.content === 'string' ? m.content : partsFromContent(m.content).map(p => p.text || '').join('\n');
      systemInstruction = systemInstruction ? systemInstruction + '\n' + text : text;
      continue;
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: partsFromContent(m.content)
    });
  }
  let serverSys = buildServerSystemInstruction();
  if (useWorkspaceTools) serverSys += '\n\n' + buildWorkspaceSystemInstruction();
  systemInstruction = systemInstruction ? serverSys + '\n\n' + systemInstruction : serverSys;
  // Lindungi dari konteks kepanjangan: simpan 30 pesan terakhir
  if (contents.length > 30) contents.splice(0, contents.length - 30);
  return { systemInstruction, contents };
}

const WORKSPACE_FUNCTION_DECLARATIONS = [
  { name: 'list_items',
    description: 'Lihat daftar file & folder di dalam sebuah folder workspace Clincoo milik user. Gunakan ini untuk melihat isi workspace atau folder sebelum melakukan operasi lain.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path folder. Contoh: "root" (folder utama), "js", "root/css/style". Default: root.' } } } },
  { name: 'read_file',
    description: 'Baca isi lengkap sebuah file di workspace. WAJIB dipakai sebelum mengedit file agar konten terbaru dan akurat.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path file. Contoh: "index.html", "js/app.js", "root/style.css".' } }, required: ['path'] } },
  { name: 'write_file',
    description: 'Buat file baru di workspace atau timpa seluruh isi file yang sudah ada dengan konten baru. Folder induk dibuat otomatis jika belum ada.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path file tujuan, contoh: "pages/about.html".' }, content: { type: 'STRING', description: 'Isi lengkap file yang akan ditulis (overwrite penuh).' } }, required: ['path', 'content'] } },
  { name: 'create_folder',
    description: 'Buat folder baru (beserta folder induknya) di workspace.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path folder, contoh: "assets/img".' } }, required: ['path'] } },
  { name: 'rename_item',
    description: 'Ubah nama file atau folder di workspace.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path item yang di-rename, contoh: "old-name.html".' }, new_name: { type: 'STRING', description: 'Nama baru (tanpa path), contoh: "new-name.html".' } }, required: ['path', 'new_name'] } },
  { name: 'delete_item',
    description: 'Hapus file atau folder (beserta seluruh isinya) dari workspace. PERMANEN — konfirmasi dulu ke user kecuali user sudah jelas meminta penghapusan.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path item yang akan dihapus.' } }, required: ['path'] } },
  { name: 'search_items',
    description: 'Cari file atau folder di seluruh workspace berdasarkan nama.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Kata kunci nama file/folder.' } }, required: ['query'] } }
];

function buildWorkspaceSystemInstruction() {
  return [
    'Kamu terhubung ke workspace Clincoo milik user dan punya function calling untuk mengelola file & folder:',
    'list_items, read_file, write_file, create_folder, rename_item, delete_item, search_items.',
    'Gunakan tools ini SETIAP KALI user meminta membuat, melihat, mengubah, mencari, atau menghapus file/folder, atau saat user minta menyimpan kode ke workspace.',
    'Format path: file di folder utama = "index.html"; file dalam folder = "js/app.js" (awalan "root/" opsional dan diabaikan).',
    'Sebelum mengedit file, WAJIB read_file dulu untuk melihat isi aslinya. Sebelum menghapus, minta konfirmasi kecuali user sudah jelas meminta hapus.',
    'Setelah operasi berhasil, jelaskan singkat dan jelas apa yang kamu lakukan (file/folder apa yang dibuat/diubah/dihapus).',
    'Jangan pernah mengarang isi file — kalau ragu, panggil read_file atau list_items.'
  ].join(' ');
}

async function callGemini(apiKey, messages, useWorkspaceTools) {
  const { systemInstruction, contents } = toGeminiPayload(messages, useWorkspaceTools);
  let lastError = null;

  for (const model of PREFERRED_MODELS) {
    try {
      const payload = { contents, tools: [{ google_search: {} }] };
      if (useWorkspaceTools) payload.tools.push({ functionDeclarations: WORKSPACE_FUNCTION_DECLARATIONS });
      if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };

      let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        // Fallback: coba lagi tanpa tools (model/kuota bisa menolak grounding)
        delete payload.tools;
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errText2 = await res.text();
          lastError = `Model ${model} returned ${res.status}: ${(errText2 || errText).slice(0, 300)}`;
          continue;
        }
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p.text || '').join('') || '';
      const toolCalls = parts.filter(p => p.functionCall).map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
      if (toolCalls.length > 0) return { tool_calls: toolCalls, text, model };
      if (!text) { lastError = `Model ${model} returned empty response`; continue; }

      return { text, model };
    } catch (err) {
      lastError = err.message;
    }
  }
  return { error: lastError || 'All models failed' };
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(b => b?.type === 'text').map(b => b.text).join(' ');
  }
  return String(content || '');
}

// GET /api/chat?session_id=xxx — load chat history from D1
// GET /api/chat — list all sessions
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    try { await db.prepare('ALTER TABLE chat_sessions ADD COLUMN project_id TEXT').run(); } catch(e) {}

    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');
    const projectId = url.searchParams.get('project_id');

    if (sessionId) {
      const msgs = await db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').bind(sessionId).all();
      const session = await db.prepare('SELECT * FROM chat_sessions WHERE id = ?').bind(sessionId).first();
      return new Response(JSON.stringify({ session, messages: msgs.results || [] }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    let sessions;
    if (projectId) {
      sessions = await db.prepare('SELECT * FROM chat_sessions WHERE project_id = ? ORDER BY updated_at DESC').bind(projectId).all();
    } else {
      sessions = await db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all();
    }
    return new Response(JSON.stringify({ sessions: sessions.results || [] }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

// POST /api/chat — save user message, call Gemini, save AI response, return it
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    const body = await request.json();
    const action = body.action || 'send';

    // --- Create new session ---
    if (action === 'new_session') {
      const sessionId = body.session_id || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const title = body.title || 'Percakapan Baru';
      const projectId = body.project_id || '';
      try { await db.prepare('ALTER TABLE chat_sessions ADD COLUMN project_id TEXT').run(); } catch(e) {}
      await db.prepare('INSERT INTO chat_sessions (id, title, project_id) VALUES (?, ?, ?)').bind(sessionId, title, projectId).run();
      return new Response(JSON.stringify({ session_id: sessionId, title }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // --- Delete session ---
    if (action === 'delete_session') {
      const sessionId = body.session_id;
      if (!sessionId) return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      await db.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(sessionId).run();
      await db.prepare('DELETE FROM chat_sessions WHERE id = ?').bind(sessionId).run();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // --- Send message (main chat flow) ---
    let sessionId = body.session_id;
    const userContent = body.content || '';
    const apiMessages = body.messages || [];

    // Save user message to D1 (raw text only, not the full context array)
    const userText = extractText(userContent) || extractText(apiMessages[apiMessages.length - 1]?.content);

    if (!sessionId) {
      sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      try { await db.prepare('ALTER TABLE chat_sessions ADD COLUMN project_id TEXT').run(); } catch(e) {}
      const projectId = body.project_id || '';
      try { await db.prepare('INSERT INTO chat_sessions (id, title, project_id) VALUES (?, ?, ?)').bind(sessionId, userText ? userText.substring(0, 50) : 'Percakapan Baru', projectId).run(); } catch(e) {}
    }
    const saveUserMessage = body.save_user_message !== false;
    if (userText && saveUserMessage) {
      await db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').bind(sessionId, 'user', userText).run();
    }

    // Update session timestamp + auto-title from first message
    await db.prepare('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?').bind(sessionId).run();
    const sessionRow = await db.prepare('SELECT title FROM chat_sessions WHERE id = ?').bind(sessionId).first();
    if (sessionRow && (sessionRow.title === 'Percakapan Baru' || !sessionRow.title) && userText) {
      const newTitle = userText.substring(0, 50);
      await db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').bind(newTitle, sessionId).run();
    }

    // Get API key
    const apiKey = await getApiKey(env);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured in database' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Call Gemini using client-provided messages (preserves system instructions + external context)
    const useWorkspaceTools = body.workspace_tools === true;
    const result = await callGemini(apiKey, apiMessages.length > 0 ? apiMessages : [{ role: 'user', content: userText }], useWorkspaceTools);

    if (result.error) {
      await db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').bind(sessionId, 'assistant', '[Error: ' + result.error + ']').run();
      return new Response(JSON.stringify({ error: result.error }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Tool-call turn: client will execute workspace CRUD locally and re-post with function responses.
    // Don't persist intermediate assistant turns; only the final text is saved below.
    if (result.tool_calls) {
      return new Response(JSON.stringify({ tool_calls: result.tool_calls, session_id: sessionId, model: result.model }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Save AI response to D1
    await db.prepare('INSERT INTO chat_messages (session_id, role, content, model) VALUES (?, ?, ?, ?)').bind(sessionId, 'assistant', result.text, result.model).run();

    // Log activity
    try { await db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').bind('chat_message', 'AI response via ' + result.model).run(); } catch {}

    return new Response(JSON.stringify({ text: result.text, model: result.model, session_id: sessionId }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

// DELETE /api/chat?session_id=xxx — clear messages for a session
export async function onRequestDelete({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return new Response(JSON.stringify({ error: 'session_id required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    await db.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(sessionId).run();
    await db.prepare('UPDATE chat_sessions SET updated_at = datetime(\'now\') WHERE id = ?').bind(sessionId).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
