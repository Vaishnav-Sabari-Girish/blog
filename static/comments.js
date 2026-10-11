(() => {
  const C = window.COMMENTS;
  const API = "https://codeberg.org/api/v1";
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const rand = () => b64(crypto.getRandomValues(new Uint8Array(32)));
  const getTok = () => { try { return localStorage.getItem("cb_token"); } catch { return null; } };
  const setTok = t => { try { t ? localStorage.setItem("cb_token", t) : localStorage.removeItem("cb_token"); } catch {} };

  async function login() {
    const verifier = rand(), state = rand();
    const challenge = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    sessionStorage.setItem("cb_verifier", verifier);
    sessionStorage.setItem("cb_state", state);
    sessionStorage.setItem("cb_return", location.href);
    location.href = "https://codeberg.org/login/oauth/authorize?" + new URLSearchParams({
      client_id: C.clientId, redirect_uri: C.redirectUri, response_type: "code",
      code_challenge: challenge, code_challenge_method: "S256", state,
    });
  }

  async function handleCallback() {
    const p = new URLSearchParams(location.search);
    if (p.get("state") !== sessionStorage.getItem("cb_state")) throw new Error("state mismatch");
    const r = await fetch("https://codeberg.org/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: C.clientId, code: p.get("code"),
        redirect_uri: C.redirectUri, code_verifier: sessionStorage.getItem("cb_verifier"),
      }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(JSON.stringify(j));
    setTok(j.access_token);
    location.replace(sessionStorage.getItem("cb_return") || "/");
  }

  async function api(path, opts = {}) {
    const t = getTok();
    const r = await fetch(API + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) },
    });
    if (r.status === 401) { setTok(null); throw new Error("Session expired, please sign in again."); }
    if (!r.ok) throw new Error(`API ${r.status} on ${opts.method || "GET"} ${path}`);
    return r.json();
  }

  async function findIssue() {
    const list = await api(`/repos/${C.owner}/${C.repo}/issues?type=issues&state=all&q=${encodeURIComponent(C.title)}`);
    return list.find(i => i.title === C.title);
  }

  function render(el, comments) {
    el.textContent = comments.length ? "" : "No comments yet.";
    for (const c of comments) {
      const d = document.createElement("div"); d.className = "comment";
      const h = document.createElement("strong");
      h.textContent = `${c.user.login} · ${new Date(c.created_at).toLocaleDateString()}`;
      const p = document.createElement("p"); p.style.whiteSpace = "pre-wrap";
      p.textContent = c.body;
      d.append(h, p); el.append(d);
    }
  }

  async function init() {
    const list = document.getElementById("comment-list");
    const form = document.getElementById("comment-form");
    const loginBtn = document.getElementById("comment-login");
    const status = document.getElementById("comment-status");
    let issue;
    try {
      issue = await findIssue();
      render(list, issue ? await api(`/repos/${C.owner}/${C.repo}/issues/${issue.number}/comments`) : []);
    } catch (e) { list.textContent = "Couldn't load comments."; console.error(e); }

    if (getTok()) {
      form.style.display = "block";
      document.getElementById("comment-logout").onclick = () => { setTok(null); location.reload(); };
      form.onsubmit = async ev => {
        ev.preventDefault();
        const body = form.elements.body.value.trim();
        if (!body) return;
        status.textContent = "Posting…";
        try {
          if (!issue) issue = await api(`/repos/${C.owner}/${C.repo}/issues`, {
            method: "POST", body: JSON.stringify({ title: C.title, body: `Comments for ${C.permalink}` }),
          });
          await api(`/repos/${C.owner}/${C.repo}/issues/${issue.number}/comments`, {
            method: "POST", body: JSON.stringify({ body }),
          });
          form.reset(); status.textContent = "";
          render(list, await api(`/repos/${C.owner}/${C.repo}/issues/${issue.number}/comments`));
        } catch (e) { status.textContent = e.message; }
      };
    } else {
      loginBtn.style.display = "inline";
      loginBtn.onclick = login;
    }
  }

  window.CommentsApp = { init, handleCallback };
})();
