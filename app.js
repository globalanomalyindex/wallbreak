/* wallbreak — in-browser scanner.
   Reads your font locally, searches GitHub code search with your token, fetches each
   candidate's bytes, and grades it weak / strong / proven. Only ever does the three
   reads (search, repo metadata, blob contents); never writes, stars, forks, or clones. */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var filesInput = $("#files");
  var drop = $("#drop");
  var browse = $("#browse");
  var fontList = $("#font-list");
  var tokenInput = $("#token");
  var form = $("#scan-form");
  var scanBtn = $("#scan");
  var statusEl = $("#status");
  var resultsEl = $("#results");

  var fingerprints = [];
  var repoCache = {};
  var MAX_CANDIDATES = 24; // keep the footprint (and rate-limit use) small

  function AppError(msg) { this.message = msg; }

  /* ---- token: session-only persistence ---- */
  try {
    var saved = sessionStorage.getItem("wb_token");
    if (saved) tokenInput.value = saved;
  } catch (e) {}
  tokenInput.addEventListener("input", function () {
    try { sessionStorage.setItem("wb_token", tokenInput.value.trim()); } catch (e) {}
  });

  /* ---- small helpers ---- */
  function lc(s) { return (s || "").toLowerCase(); }
  function basename(p) { return (p || "").split("/").pop(); }
  function stem(name) { return name.replace(/\.(otf|ttf|woff2?|otc|ttc)$/i, ""); }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function bytesToHex(buf) {
    var u = new Uint8Array(buf);
    var s = "";
    for (var i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, "0");
    return s;
  }
  async function sha256hex(src) {
    var d = await crypto.subtle.digest("SHA-256", src);
    return bytesToHex(d);
  }

  function getName(font, key) {
    try {
      var n = font.names && font.names[key];
      if (!n && font.tables && font.tables.name) n = font.tables.name[key];
      if (!n) return null;
      if (typeof n === "string") return n.trim() || null;
      return (n.en || n.und || Object.values(n)[0] || "").trim() || null;
    } catch (e) { return null; }
  }

  // returns {family, copyright, designer, uniqueId} or null if unparseable (e.g. woff2)
  function readNameTable(arrbuf) {
    try {
      var font = opentype.parse(arrbuf);
      return {
        family: getName(font, "fontFamily") || getName(font, "preferredFamily"),
        copyright: getName(font, "copyright"),
        designer: getName(font, "designer") || getName(font, "manufacturer"),
        uniqueId: getName(font, "uniqueID"),
      };
    } catch (e) { return null; }
  }

  async function fingerprintFile(file) {
    var arrbuf = await file.arrayBuffer();
    var sha = await sha256hex(arrbuf);
    var nt = readNameTable(arrbuf);
    return {
      filename: file.name,
      stem: stem(file.name),
      family: nt && nt.family,
      copyright: nt && nt.copyright,
      designer: nt && nt.designer,
      uniqueId: nt && nt.uniqueId,
      sha256: sha,
      parsed: !!nt,
    };
  }

  function renderFontList() {
    fontList.innerHTML = "";
    fingerprints.forEach(function (fp) {
      var li = document.createElement("li");
      var name = document.createElement("span");
      name.textContent = fp.filename;
      var meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = fp.family
        ? fp.family
        : fp.parsed
        ? "no embedded family name"
        : "woff2: name table not read in-browser";
      li.appendChild(name);
      li.appendChild(meta);
      fontList.appendChild(li);
    });
  }

  async function addFiles(fileObjs) {
    var arr = Array.prototype.slice.call(fileObjs).filter(function (f) {
      return /\.(otf|ttf|woff2?)$/i.test(f.name);
    });
    for (var i = 0; i < arr.length; i++) {
      try {
        var fp = await fingerprintFile(arr[i]);
        if (!fingerprints.some(function (x) { return x.sha256 === fp.sha256; })) {
          fingerprints.push(fp);
        }
      } catch (e) { /* skip unreadable file */ }
    }
    renderFontList();
  }

  /* ---- drag / drop / browse ---- */
  browse.addEventListener("click", function () { filesInput.click(); });
  filesInput.addEventListener("change", function () { addFiles(filesInput.files); });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("drag"); });
  });
  drop.addEventListener("dragleave", function (e) {
    if (!drop.contains(e.relatedTarget)) drop.classList.remove("drag");
  });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ---- github (read-only: search, repo metadata, blob contents) ---- */
  function ghHeaders(token) {
    return {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
  async function gh(url, token) {
    var res = await fetch(url, { headers: ghHeaders(token) });
    if (res.status === 401) throw new AppError("github rejected that token (401). double-check it.");
    if (res.status === 422) throw new AppError("github could not run that search (422). try a more specific filename.");
    if (res.status === 403 || res.status === 429) {
      var rem = res.headers.get("x-ratelimit-remaining");
      var reset = +res.headers.get("x-ratelimit-reset");
      if (rem === "0" && reset) {
        var secs = Math.max(1, reset - Math.floor(Date.now() / 1000));
        throw new AppError("github search rate limit reached. give it ~" + secs + "s (the code-search api allows about 10 requests a minute).");
      }
      throw new AppError("github returned 403. the token may not have access.");
    }
    if (!res.ok) throw new AppError("github error " + res.status + ".");
    return res.json();
  }
  async function searchCode(q, token) {
    var data = await gh(
      "https://api.github.com/search/code?per_page=30&q=" + encodeURIComponent(q),
      token
    );
    return data.items || [];
  }
  async function fetchBlobBytes(item, token) {
    if (!item.git_url) return null;
    var data = await gh(item.git_url, token);
    if (data.encoding !== "base64" || !data.content) return null;
    var bin = atob(data.content.replace(/\s/g, ""));
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  async function enrichRepo(fullName, token) {
    if (!fullName) return { stars: null, license: null };
    if (repoCache[fullName]) return repoCache[fullName];
    try {
      var d = await gh("https://api.github.com/repos/" + fullName, token);
      var meta = { stars: d.stargazers_count, license: d.license && d.license.spdx_id };
      repoCache[fullName] = meta;
      return meta;
    } catch (e) { return { stars: null, license: null }; }
  }

  function buildQueries(fp) {
    var qs = ["filename:" + fp.filename]; // exact file
    if (fp.stem && fp.stem !== fp.filename) qs.push("filename:" + fp.stem); // re-exported variants
    return qs;
  }

  async function grade(fp, item, token) {
    var evidence = [];
    var tier = 0; // 1 weak, 2 strong, 3 proven
    var candName = item.name || basename(item.path);

    if (lc(candName) === lc(fp.filename)) {
      evidence.push("exact filename match");
      tier = Math.max(tier, 1);
    } else if (fp.stem && lc(candName).indexOf(lc(fp.stem)) >= 0) {
      evidence.push('filename contains "' + fp.stem + '"');
      tier = Math.max(tier, 1);
    }

    var bytes = null;
    try { bytes = await fetchBlobBytes(item, token); } catch (e) { /* keep weak */ }
    if (bytes) {
      var ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      var sha = await sha256hex(ab);
      if (sha === fp.sha256) {
        evidence.push("sha-256 identical (byte-for-byte copy)");
        tier = 3;
      }
      var nt = readNameTable(ab);
      if (nt) {
        if (fp.copyright && nt.copyright === fp.copyright) {
          evidence.push("embedded copyright matches");
          tier = Math.max(tier, 2);
        }
        if (fp.uniqueId && nt.uniqueId === fp.uniqueId) {
          evidence.push("embedded unique id matches");
          tier = Math.max(tier, 2);
        }
        if (fp.family && nt.family === fp.family && tier < 2) {
          evidence.push("embedded family matches");
          tier = Math.max(tier, 2);
        }
      }
    }

    if (tier === 0) {
      tier = 1;
      evidence.push("turned up in the filename search");
    }
    var name = tier === 3 ? "proven" : tier === 2 ? "strong" : "weak";
    return { tier: tier, confidence: name, evidence: evidence };
  }

  /* ---- ui state ---- */
  function setStatus(msg) {
    statusEl.hidden = false;
    statusEl.className = "status";
    statusEl.textContent = msg;
  }
  function showError(msg) {
    statusEl.hidden = false;
    statusEl.className = "status error";
    statusEl.textContent = msg;
  }

  function renderResults(hits, checked) {
    resultsEl.innerHTML = "";
    var n = checked + (checked === 1 ? " candidate" : " candidates");
    if (!hits.length) {
      setStatus("no public copies found across " + n + ". that's the good outcome.");
      return;
    }
    setStatus(
      hits.length + (hits.length === 1 ? " hit" : " hits") + " across " + n + ":"
    );
    var frag = document.createDocumentFragment();
    hits.forEach(function (h) {
      var row = document.createElement("div");
      row.className = "hit";

      var tier = document.createElement("span");
      tier.className = "tier tier-" + h.confidence;
      tier.textContent = h.confidence;

      var body = document.createElement("div");
      body.className = "hit-body";

      var repo = document.createElement("div");
      repo.className = "repo";
      repo.innerHTML =
        '<a class="link" href="' + esc(h.html_url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(h.repo) + ' <span class="arrow" aria-hidden="true">→</span></a>';

      var meta = document.createElement("div");
      meta.className = "hit-meta";
      var bits = [];
      if (h.stars != null) bits.push(h.stars + " ★");
      if (h.license) bits.push(esc(h.license));
      bits.push(esc(h.path));
      meta.innerHTML = bits.join(" · ");

      var ev = document.createElement("div");
      ev.className = "hit-evidence";
      ev.textContent = "matched " + h.font + " — " + h.evidence.join(", ");

      body.appendChild(repo);
      body.appendChild(meta);
      body.appendChild(ev);
      row.appendChild(tier);
      row.appendChild(body);
      frag.appendChild(row);
    });
    resultsEl.appendChild(frag);
  }

  async function runScan() {
    resultsEl.innerHTML = "";
    if (!fingerprints.length) {
      showError("add at least one font file first.");
      return;
    }
    var token = tokenInput.value.trim();
    if (!token) {
      showError("add a github token. code search needs one (a token with no scopes works for public search).");
      return;
    }

    scanBtn.disabled = true;
    try {
      var hits = [];
      var seen = {};
      var checked = 0;

      for (var f = 0; f < fingerprints.length; f++) {
        var fp = fingerprints[f];
        setStatus('searching github for "' + (fp.family || fp.filename) + '"…');
        var queries = buildQueries(fp);
        var items = [];
        for (var qi = 0; qi < queries.length; qi++) {
          items = items.concat(await searchCode(queries[qi], token));
        }
        var uniq = [];
        items.forEach(function (it) {
          var key = (it.repository && it.repository.full_name) + "/" + it.path;
          if (!seen[key]) { seen[key] = 1; uniq.push(it); }
        });

        for (var c = 0; c < uniq.length && checked < MAX_CANDIDATES; c++) {
          var item = uniq[c];
          checked++;
          setStatus("checking candidate " + checked + "…");
          var g = await grade(fp, item, token);
          var full = item.repository ? item.repository.full_name : "";
          var meta = await enrichRepo(full, token);
          hits.push({
            font: fp.filename,
            repo: full,
            html_url: item.html_url,
            path: item.path,
            stars: meta.stars,
            license: meta.license,
            confidence: g.confidence,
            tier: g.tier,
            evidence: g.evidence,
          });
        }
      }

      hits.sort(function (a, b) { return b.tier - a.tier; });
      renderResults(hits, checked);
    } catch (e) {
      showError(e && e.message ? e.message : "something went wrong during the scan.");
    } finally {
      scanBtn.disabled = false;
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    runScan();
  });
})();
