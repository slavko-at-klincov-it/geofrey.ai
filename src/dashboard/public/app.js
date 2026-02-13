// @ts-nocheck
/* geofrey.ai Dashboard — client-side app */

(function () {
  "use strict";

  let token = "";
  let eventSource = null;
  let statusInterval = null;
  let reconnectTimer = null;
  const RECONNECT_DELAY_MS = 3000;

  // DOM references
  const messagesEl = document.getElementById("messages");
  const messageForm = document.getElementById("message-form");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const tokenModal = document.getElementById("token-modal");
  const tokenForm = document.getElementById("token-form");
  const tokenInput = document.getElementById("token-input");
  const statusConnection = document.getElementById("status-connection");
  const statusUptime = document.getElementById("status-uptime");
  const statusMessages = document.getElementById("status-messages");
  const approvalsList = document.getElementById("approvals-list");
  const auditList = document.getElementById("audit-list");

  // Track messages by ID for edit support
  const messageElements = new Map();
  // Track pending approvals
  const pendingApprovals = new Map();

  // --- Markdown rendering ---

  function renderMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code class="lang-' + lang + '">' + code + "</code></pre>";
    });

    // Inline code (`...`)
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    // Bold (**...**)
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Italic (*...*)
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

    // Line breaks
    html = html.replace(/\n/g, "<br>");

    // Clean up <br> inside <pre>
    html = html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, function (_, attrs, code) {
      return "<pre><code" + attrs + ">" + code.replace(/<br>/g, "\n") + "</code></pre>";
    });

    return html;
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatUptime(seconds) {
    if (seconds < 60) return seconds + "s";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m";
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    return h + "h " + m + "m";
  }

  // --- API calls ---

  function apiHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    return headers;
  }

  function apiUrl(path) {
    return path + (token ? "?token=" + encodeURIComponent(token) : "");
  }

  async function sendMessage(text) {
    sendBtn.disabled = true;
    try {
      var res = await fetch("/api/message", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text: text }),
      });
      if (res.status === 401) {
        showTokenModal();
        return;
      }
      if (!res.ok) {
        console.error("Send failed:", res.status);
      }
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      sendBtn.disabled = false;
    }
  }

  async function sendApprovalResponse(nonce, approved) {
    try {
      var res = await fetch("/api/approval/" + nonce, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ approved: approved }),
      });
      if (res.status === 401) {
        showTokenModal();
      }
    } catch (err) {
      console.error("Approval error:", err);
    }
  }

  async function fetchStatus() {
    try {
      var res = await fetch("/api/status", { headers: apiHeaders() });
      if (res.status === 401) return;
      if (!res.ok) return;
      var data = await res.json();
      statusUptime.textContent = formatUptime(data.uptime);
      statusMessages.textContent = String(data.messageCount);
    } catch {
      // ignore
    }
  }

  async function fetchAudit() {
    try {
      var res = await fetch("/api/audit", { headers: apiHeaders() });
      if (res.status === 401) return;
      if (!res.ok) return;
      var data = await res.json();
      renderAuditLog(data.entries || []);
    } catch {
      // ignore
    }
  }

  // --- SSE connection ---

  function connectSSE() {
    if (eventSource) {
      eventSource.close();
    }

    var url = apiUrl("/api/events");
    eventSource = new EventSource(url);

    eventSource.addEventListener("message", function (e) {
      try {
        var msg = JSON.parse(e.data);
        addOrUpdateMessage(msg);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener("edit", function (e) {
      try {
        var data = JSON.parse(e.data);
        editMessage(data.id, data.text);
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener("approval", function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data.resolved) {
          removeApproval(data.nonce);
        } else {
          addApproval(data);
        }
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener("status", function (e) {
      try {
        var data = JSON.parse(e.data);
        statusUptime.textContent = formatUptime(data.uptime);
      } catch {
        // ignore
      }
    });

    eventSource.onopen = function () {
      statusConnection.textContent = "Online";
      statusConnection.className = "status-value status-online";
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    eventSource.onerror = function () {
      statusConnection.textContent = "Offline";
      statusConnection.className = "status-value status-offline";
      eventSource.close();
      eventSource = null;
      // Auto-reconnect
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(function () {
          reconnectTimer = null;
          connectSSE();
        }, RECONNECT_DELAY_MS);
      }
    };
  }

  // --- UI rendering ---

  function addOrUpdateMessage(msg) {
    if (messageElements.has(msg.id)) {
      // Update existing
      var el = messageElements.get(msg.id);
      var contentEl = el.querySelector(".content");
      if (contentEl) contentEl.innerHTML = renderMarkdown(msg.text);
      return;
    }

    var div = document.createElement("div");
    div.className = "message " + msg.role;
    div.dataset.id = msg.id;

    var content = document.createElement("div");
    content.className = "content";
    content.innerHTML = renderMarkdown(msg.text);
    div.appendChild(content);

    var time = document.createElement("span");
    time.className = "timestamp";
    time.textContent = formatTime(msg.timestamp);
    div.appendChild(time);

    messagesEl.appendChild(div);
    messageElements.set(msg.id, div);

    statusMessages.textContent = String(messageElements.size);
    scrollToBottom();
  }

  function editMessage(id, text) {
    var el = messageElements.get(id);
    if (!el) return;
    var contentEl = el.querySelector(".content");
    if (contentEl) contentEl.innerHTML = renderMarkdown(text);
    scrollToBottom();
  }

  function addApproval(data) {
    pendingApprovals.set(data.nonce, data);
    renderApprovals();
  }

  function removeApproval(nonce) {
    pendingApprovals.delete(nonce);
    renderApprovals();
  }

  function renderApprovals() {
    if (pendingApprovals.size === 0) {
      approvalsList.innerHTML = '<p class="empty-state">No pending approvals</p>';
      return;
    }

    approvalsList.innerHTML = "";
    pendingApprovals.forEach(function (approval) {
      var card = document.createElement("div");
      card.className = "approval-card";

      var toolName = document.createElement("div");
      toolName.className = "tool-name";
      toolName.textContent = approval.toolName;
      card.appendChild(toolName);

      var riskInfo = document.createElement("div");
      riskInfo.className = "risk-info";
      riskInfo.textContent = approval.classification
        ? approval.classification.level + " — " + approval.classification.reason
        : "";
      card.appendChild(riskInfo);

      var argsPreview = document.createElement("div");
      argsPreview.className = "args-preview";
      argsPreview.textContent = JSON.stringify(approval.args || {}).slice(0, 200);
      card.appendChild(argsPreview);

      var actions = document.createElement("div");
      actions.className = "approval-actions";

      var approveBtn = document.createElement("button");
      approveBtn.className = "btn-approve";
      approveBtn.textContent = "Approve";
      approveBtn.addEventListener("click", function () {
        sendApprovalResponse(approval.nonce, true);
      });
      actions.appendChild(approveBtn);

      var denyBtn = document.createElement("button");
      denyBtn.className = "btn-deny";
      denyBtn.textContent = "Deny";
      denyBtn.addEventListener("click", function () {
        sendApprovalResponse(approval.nonce, false);
      });
      actions.appendChild(denyBtn);

      card.appendChild(actions);
      approvalsList.appendChild(card);
    });
  }

  function renderAuditLog(entries) {
    if (entries.length === 0) {
      auditList.innerHTML = '<p class="empty-state">No entries</p>';
      return;
    }

    auditList.innerHTML = "";
    // Show last 20 entries in reverse order (newest first)
    var recent = entries.slice(-20).reverse();
    recent.forEach(function (entry) {
      var div = document.createElement("div");
      div.className = "audit-entry";

      var time = entry.timestamp ? entry.timestamp.slice(11, 19) : "";
      div.innerHTML =
        '<span class="audit-time">' + escapeHtml(time) + "</span> " +
        '<span class="audit-tool">' + escapeHtml(entry.toolName || "") + "</span> " +
        '<span class="audit-risk ' + escapeHtml(entry.riskLevel || "") + '">' + escapeHtml(entry.riskLevel || "") + "</span> " +
        (entry.approved ? "OK" : "DENIED");

      auditList.appendChild(div);
    });
  }

  function scrollToBottom() {
    requestAnimationFrame(function () {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // --- Token modal ---

  function showTokenModal() {
    tokenModal.classList.remove("hidden");
    tokenInput.focus();
  }

  function hideTokenModal() {
    tokenModal.classList.add("hidden");
  }

  // --- Auto-resize textarea ---

  function autoResize() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + "px";
  }

  // --- Init ---

  function init() {
    // Check for token in URL
    var params = new URLSearchParams(window.location.search);
    var urlToken = params.get("token");
    if (urlToken) {
      token = urlToken;
      // Remove token from URL for security
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Try connecting — if 401, show modal
    connectSSE();
    fetchStatus();
    fetchAudit();

    // Periodic status + audit refresh
    statusInterval = setInterval(function () {
      fetchStatus();
      fetchAudit();
    }, 10000);

    // Message form
    messageForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = messageInput.value.trim();
      if (!text) return;
      messageInput.value = "";
      autoResize();
      sendMessage(text);
    });

    // Enter to send (Shift+Enter for newline)
    messageInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        messageForm.dispatchEvent(new Event("submit"));
      }
    });

    messageInput.addEventListener("input", autoResize);

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
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
