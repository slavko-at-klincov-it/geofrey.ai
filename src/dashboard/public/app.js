// @ts-nocheck
/* geofrey.ai Dashboard — client */

(function () {
  "use strict";

  let token = "";
  let eventSource = null;
  let statusInterval = null;
  let reconnectTimer = null;
  let awaitingResponse = false;
  const RECONNECT_MS = 3000;

  // DOM
  const messagesEl = document.getElementById("messages");
  const msgForm = document.getElementById("msg-form");
  const msgInput = document.getElementById("msg-input");
  const sendBtn = document.getElementById("send-btn");
  const tokenModal = document.getElementById("token-modal");
  const tokenForm = document.getElementById("token-form");
  const tokenInput = document.getElementById("token-input");
  const statusConn = document.getElementById("status-connection");
  const statusDot = document.getElementById("status-dot");
  const mobileDot = document.getElementById("mobile-dot");
  const statusUptime = document.getElementById("status-uptime");
  const statusMsgs = document.getElementById("status-messages");
  const approvalsList = document.getElementById("approvals-list");
  const approvalBadge = document.getElementById("approval-badge");
  const auditList = document.getElementById("audit-list");
  const typingEl = document.getElementById("typing");
  const welcomeEl = document.getElementById("welcome");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");

  const messageEls = new Map();
  const pendingApprovals = new Map();

  // ── Markdown ────────────────────────────────────

  function renderMarkdown(text) {
    if (!text) return "";
    var html = escapeHtml(text);

    // Fenced code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code class="lang-' + lang + '">' + code + "</code></pre>";
    });

    // Tables: detect lines with | separators
    html = html.replace(/((?:^|\n)\|.+\|(?:\n\|.+\|)+)/g, function (_, table) {
      var rows = table.trim().split("\n");
      if (rows.length < 2) return table;
      var out = "<table>";
      rows.forEach(function (row, i) {
        // Skip separator row (|---|---|)
        if (/^\|[\s\-:|]+\|$/.test(row)) return;
        var tag = i === 0 ? "th" : "td";
        var cells = row.split("|").filter(function (c) { return c.trim() !== ""; });
        out += "<tr>" + cells.map(function (c) {
          return "<" + tag + ">" + c.trim() + "</" + tag + ">";
        }).join("") + "</tr>";
      });
      return out + "</table>";
    });

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Headers (must be before bold)
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr>');

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");

    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>(\n|$))+/g, function (m) {
      return "<ul>" + m + "</ul>";
    });

    // Line breaks (but not inside pre, table, ul)
    html = html.replace(/\n/g, "<br>");

    // Clean up br inside block elements
    html = html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, function (_, a, c) {
      return "<pre><code" + a + ">" + c.replace(/<br>/g, "\n") + "</code></pre>";
    });
    html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>(<br>)?/g, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/(h[1-4]|hr|table|ul|blockquote)><br>/g, '</$1>');
    html = html.replace(/<br><(h[1-4]|hr|table|ul|blockquote)/g, '<$1');

    return html;
  }

  function escapeHtml(text) {
    var d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatUptime(s) {
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m " + (s % 60) + "s";
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    return h + "h " + m + "m";
  }

  // ── API ─────────────────────────────────────────

  function headers() {
    var h = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  function apiUrl(path) {
    return path + (token ? "?token=" + encodeURIComponent(token) : "");
  }

  async function sendMessage(text) {
    sendBtn.disabled = true;
    awaitingResponse = true;
    showTyping();
    try {
      var res = await fetch("/api/message", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ text: text }),
      });
      if (res.status === 401) { showTokenModal(); return; }
      if (!res.ok) console.error("Send failed:", res.status);
    } catch (err) {
      console.error("Send error:", err);
      hideTyping();
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function sendApproval(nonce, approved) {
    try {
      var res = await fetch("/api/approval/" + nonce, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ approved: approved }),
      });
      if (res.status === 401) showTokenModal();
    } catch (err) {
      console.error("Approval error:", err);
    }
  }

  async function fetchStatus() {
    try {
      var res = await fetch("/api/status", { headers: headers() });
      if (!res.ok) return;
      var d = await res.json();
      statusUptime.textContent = formatUptime(d.uptime);
      statusMsgs.textContent = String(d.messageCount);
    } catch { /* ignore */ }
  }

  async function fetchAudit() {
    try {
      var res = await fetch("/api/audit", { headers: headers() });
      if (!res.ok) return;
      var d = await res.json();
      renderAudit(d.entries || []);
    } catch { /* ignore */ }
  }

  // ── SSE ─────────────────────────────────────────

  function connectSSE() {
    if (eventSource) eventSource.close();

    eventSource = new EventSource(apiUrl("/api/events"));

    eventSource.addEventListener("message", function (e) {
      try {
        var msg = JSON.parse(e.data);
        addOrUpdateMsg(msg);
        if (msg.role === "assistant") {
          awaitingResponse = false;
          hideTyping();
        }
      } catch { /* ignore */ }
    });

    eventSource.addEventListener("edit", function (e) {
      try {
        var d = JSON.parse(e.data);
        editMsg(d.id, d.text);
      } catch { /* ignore */ }
    });

    eventSource.addEventListener("approval", function (e) {
      try {
        var d = JSON.parse(e.data);
        d.resolved ? removeApproval(d.nonce) : addApproval(d);
      } catch { /* ignore */ }
    });

    eventSource.addEventListener("status", function (e) {
      try {
        var d = JSON.parse(e.data);
        if (d.uptime) statusUptime.textContent = formatUptime(d.uptime);
      } catch { /* ignore */ }
    });

    eventSource.onopen = function () {
      setOnline(true);
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    eventSource.onerror = function () {
      setOnline(false);
      eventSource.close();
      eventSource = null;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connectSSE();
        }, RECONNECT_MS);
      }
    };
  }

  function setOnline(on) {
    statusConn.textContent = on ? "Online" : "Offline";
    statusDot.className = "dot-status " + (on ? "online" : "offline");
    if (mobileDot) mobileDot.className = "dot-status " + (on ? "online" : "offline");
  }

  // ── UI rendering ────────────────────────────────

  function hideWelcome() {
    if (!welcomeEl || welcomeEl.classList.contains("fade-out")) return;
    welcomeEl.classList.add("fade-out");
    setTimeout(function () {
      if (welcomeEl.parentNode) welcomeEl.parentNode.removeChild(welcomeEl);
    }, 400);
  }

  function addOrUpdateMsg(msg) {
    hideWelcome();

    if (messageEls.has(msg.id)) {
      var el = messageEls.get(msg.id);
      var c = el.querySelector(".content");
      if (c) c.innerHTML = renderMarkdown(msg.text);
      return;
    }

    var div = document.createElement("div");
    div.className = "msg " + msg.role;
    div.dataset.id = msg.id;

    var content = document.createElement("div");
    content.className = "content";
    content.innerHTML = renderMarkdown(msg.text);
    div.appendChild(content);

    var ts = document.createElement("span");
    ts.className = "ts";
    ts.textContent = formatTime(msg.timestamp || Date.now());
    div.appendChild(ts);

    messagesEl.appendChild(div);
    messageEls.set(msg.id, div);
    statusMsgs.textContent = String(messageEls.size);
    scrollBottom();
  }

  function editMsg(id, text) {
    var el = messageEls.get(id);
    if (!el) return;
    var c = el.querySelector(".content");
    if (c) c.innerHTML = renderMarkdown(text);
    scrollBottom();
  }

  function showTyping() { typingEl.classList.remove("hidden"); scrollBottom(); }
  function hideTyping() { typingEl.classList.add("hidden"); }

  // ── Approvals ───────────────────────────────────

  function addApproval(data) {
    pendingApprovals.set(data.nonce, data);
    renderApprovals();
  }

  function removeApproval(nonce) {
    pendingApprovals.delete(nonce);
    renderApprovals();
  }

  function renderApprovals() {
    var count = pendingApprovals.size;

    if (count === 0) {
      approvalsList.innerHTML = '<p class="empty">No pending approvals</p>';
      approvalBadge.classList.add("hidden");
      return;
    }

    approvalBadge.textContent = String(count);
    approvalBadge.classList.remove("hidden");
    approvalsList.innerHTML = "";

    pendingApprovals.forEach(function (a) {
      var card = document.createElement("div");
      card.className = "approval-card urgent";

      var tool = document.createElement("div");
      tool.className = "approval-tool";
      tool.textContent = a.toolName;
      card.appendChild(tool);

      var risk = document.createElement("div");
      risk.className = "approval-risk";
      risk.textContent = a.classification
        ? a.classification.level + " — " + a.classification.reason
        : "";
      card.appendChild(risk);

      var args = document.createElement("div");
      args.className = "approval-args";
      args.textContent = JSON.stringify(a.args || {}).slice(0, 200);
      card.appendChild(args);

      var btns = document.createElement("div");
      btns.className = "approval-btns";

      var approveBtn = document.createElement("button");
      approveBtn.className = "btn-approve";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", function () { sendApproval(a.nonce, true); });
      btns.appendChild(approveBtn);

      var denyBtn = document.createElement("button");
      denyBtn.className = "btn-deny";
      denyBtn.textContent = "Deny";
      denyBtn.addEventListener("click", function () { sendApproval(a.nonce, false); });
      btns.appendChild(denyBtn);

      card.appendChild(btns);
      approvalsList.appendChild(card);
    });
  }

  // ── Audit ───────────────────────────────────────

  function renderAudit(entries) {
    if (entries.length === 0) {
      auditList.innerHTML = '<p class="empty">No entries yet</p>';
      return;
    }

    auditList.innerHTML = "";
    var recent = entries.slice(-20).reverse();

    recent.forEach(function (e) {
      var div = document.createElement("div");
      div.className = "audit-entry";

      var bar = document.createElement("span");
      bar.className = "audit-bar " + (e.riskLevel || "");
      div.appendChild(bar);

      var time = document.createElement("span");
      time.className = "audit-time";
      time.textContent = e.timestamp ? e.timestamp.slice(11, 19) : "";
      div.appendChild(time);

      var tool = document.createElement("span");
      tool.className = "audit-tool";
      tool.textContent = e.toolName || "";
      div.appendChild(tool);

      var status = document.createElement("span");
      status.className = "audit-status " + (e.approved ? "ok" : "denied");
      status.textContent = e.approved ? "OK" : "DENIED";
      div.appendChild(status);

      auditList.appendChild(div);
    });
  }

  function scrollBottom() {
    requestAnimationFrame(function () {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ── Modal ───────────────────────────────────────

  function showTokenModal() {
    tokenModal.classList.remove("hidden");
    setTimeout(function () { tokenInput.focus(); }, 100);
  }

  function hideTokenModal() {
    tokenModal.classList.add("hidden");
  }

  // ── Mobile sidebar ──────────────────────────────

  function openSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.remove("hidden");
    requestAnimationFrame(function () {
      sidebarBackdrop.classList.add("visible");
    });
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("visible");
    setTimeout(function () {
      sidebarBackdrop.classList.add("hidden");
    }, 300);
  }

  // ── Auto-resize ─────────────────────────────────

  function autoResize() {
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, 150) + "px";
  }

  // ── Init ────────────────────────────────────────

  function init() {
    // Token from URL
    var params = new URLSearchParams(window.location.search);
    var urlToken = params.get("token");
    if (urlToken) {
      token = urlToken;
      window.history.replaceState({}, "", window.location.pathname);
    }

    connectSSE();
    fetchStatus();
    fetchAudit();

    statusInterval = setInterval(function () {
      fetchStatus();
      fetchAudit();
    }, 10000);

    // Send message
    msgForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = msgInput.value.trim();
      if (!text) return;
      msgInput.value = "";
      autoResize();
      sendMessage(text);
    });

    // Enter to send
    msgInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        msgForm.dispatchEvent(new Event("submit"));
      }
    });

    msgInput.addEventListener("input", autoResize);

    // Token form
    tokenForm.addEventListener("submit", function (e) {
      e.preventDefault();
      token = tokenInput.value.trim();
      if (!token) return;
      tokenInput.value = "";
      hideTokenModal();
      connectSSE();
      fetchStatus();
      fetchAudit();
    });

    // Mobile sidebar
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function () {
        sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
      });
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", closeSidebar);
    }

    // Focus input
    msgInput.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
