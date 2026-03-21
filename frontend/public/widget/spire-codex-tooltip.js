/**
 * Spire Codex Tooltip Widget v1.0
 * Embeddable card/relic/potion tooltips for Slay the Spire 2.
 *
 * Usage:
 *   <script src="https://spire-codex.com/widget/spire-codex-tooltip.js"></script>
 *
 * Syntax:
 *   [[Strike]]              — card (default)
 *   [[card:Strike]]         — card (explicit)
 *   [[relic:Burning Blood]]  — relic
 *   [[potion:Fire Potion]]  — potion
 */
(function () {
  "use strict";

  var SITE = "https://spire-codex.com";
  var API = "https://spire-codex.com";

  var tag = document.currentScript;
  if (tag) {
    API = tag.getAttribute("data-api") || API;
    SITE = tag.getAttribute("data-site") || SITE;
  }

  // --- Cache ---
  var cache = {};
  var fetched = {};

  // --- CSS ---
  var STYLE_ID = "scx-tooltip-styles";
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".scx-link{color:#d4a843;text-decoration:none;border-bottom:1px dotted #d4a84366;cursor:pointer;transition:color .15s}" +
      ".scx-link:hover{color:#f0c860}" +
      ".scx-tip{position:fixed;z-index:999999;max-width:320px;min-width:220px;background:#1a1a1f;border:1px solid #2a2a30;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.6);padding:0;overflow:hidden;font-family:-apple-system,system-ui,sans-serif;font-size:13px;color:#e8e6e3;pointer-events:none;opacity:0;transition:opacity .15s}" +
      ".scx-tip.scx-visible{opacity:1;pointer-events:auto}" +
      ".scx-tip-img{width:100%;max-height:160px;object-fit:contain;background:#0a0a0f;display:block}" +
      ".scx-tip-body{padding:10px 12px}" +
      ".scx-tip-name{font-size:15px;font-weight:600;color:#e8e6e3;margin:0 0 4px}" +
      ".scx-tip-meta{font-size:11px;color:#6b6560;margin-bottom:6px}" +
      ".scx-tip-meta span{margin-right:6px}" +
      ".scx-tip-desc{font-size:12px;line-height:1.5;color:#b0ada8}" +
      ".scx-tip-desc .scx-gold{color:#d4a843}" +
      ".scx-tip-desc .scx-red{color:#f87171}" +
      ".scx-tip-desc .scx-blue{color:#60a5fa}" +
      ".scx-tip-desc .scx-green{color:#4ade80}" +
      ".scx-tip-attr{font-size:10px;text-align:right;padding:4px 12px 8px;color:#4a4540}" +
      ".scx-tip-attr a{color:#6b6560;text-decoration:none}" +
      ".scx-tip-attr a:hover{color:#d4a843}" +
      ".scx-tip-loading{padding:16px;text-align:center;color:#6b6560}";
    document.head.appendChild(style);
  }

  // --- Tooltip element ---
  var tip = document.createElement("div");
  tip.className = "scx-tip";
  document.body.appendChild(tip);
  var hideTimer = null;

  function showTip(anchor, type, name) {
    clearTimeout(hideTimer);
    var key = type + ":" + name.toLowerCase();
    var data = cache[key];
    if (!data) {
      tip.innerHTML = '<div class="scx-tip-loading">Loading\u2026</div>';
      positionTip(anchor);
      tip.classList.add("scx-visible");
      fetchEntity(type, name, function () {
        var d = cache[key];
        if (d) renderTip(d, type);
        positionTip(anchor);
      });
      return;
    }
    renderTip(data, type);
    positionTip(anchor);
    tip.classList.add("scx-visible");
  }

  function hideTip() {
    hideTimer = setTimeout(function () {
      tip.classList.remove("scx-visible");
    }, 150);
  }

  function positionTip(anchor) {
    var r = anchor.getBoundingClientRect();
    var tw = tip.offsetWidth;
    var th = tip.offsetHeight;
    var top = r.top - th - 8;
    var left = r.left + r.width / 2 - tw / 2;
    if (top < 8) top = r.bottom + 8;
    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    tip.style.top = top + "px";
    tip.style.left = left + "px";
  }

  function renderTip(data, type) {
    var html = "";
    if (data.image_url) {
      html += '<img class="scx-tip-img" src="' + API + data.image_url + '" alt="" crossorigin="anonymous">';
    }
    html += '<div class="scx-tip-body">';
    html += '<div class="scx-tip-name">' + esc(data.name) + "</div>";
    html += '<div class="scx-tip-meta">';
    if (type === "card") {
      if (data.type) html += "<span>" + esc(data.type) + "</span>";
      if (data.rarity) html += "<span>" + esc(data.rarity) + "</span>";
      if (data.cost != null) html += "<span>" + data.cost + " Energy</span>";
      if (data.color) html += "<span>" + capitalize(data.color) + "</span>";
    } else if (type === "relic") {
      if (data.rarity) html += "<span>" + esc(data.rarity) + "</span>";
      if (data.pool) html += "<span>" + capitalize(data.pool) + "</span>";
    } else if (type === "potion") {
      if (data.rarity) html += "<span>" + esc(data.rarity) + "</span>";
    }
    html += "</div>";
    if (data.description) {
      html += '<div class="scx-tip-desc">' + renderRichText(data.description) + "</div>";
    }
    html += "</div>";
    html += '<div class="scx-tip-attr"><a href="' + SITE + "/" + type + "s/" + encodeURIComponent(data.id.toLowerCase()) + '" target="_blank" rel="noopener">Spire Codex</a></div>';
    tip.innerHTML = html;
  }

  // --- Rich text (simplified) ---
  function renderRichText(text) {
    return text
      .replace(/\[gold\](.*?)\[\/gold\]/g, '<span class="scx-gold">$1</span>')
      .replace(/\[red\](.*?)\[\/red\]/g, '<span class="scx-red">$1</span>')
      .replace(/\[blue\](.*?)\[\/blue\]/g, '<span class="scx-blue">$1</span>')
      .replace(/\[green\](.*?)\[\/green\]/g, '<span class="scx-green">$1</span>')
      .replace(/\[\/?(?:b|sine|jitter|purple|orange|pink|aqua)\]/g, "")
      .replace(/\[energy:(\d+)\]/g, "($1 Energy)")
      .replace(/\[star:(\d+)\]/g, "($1 Stars)");
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // --- Data fetching ---
  var TYPE_ENDPOINTS = { card: "/api/cards", relic: "/api/relics", potion: "/api/potions" };

  function fetchEntity(type, name, cb) {
    var ep = TYPE_ENDPOINTS[type];
    if (!ep) return;
    var fetchKey = type;
    if (fetched[fetchKey]) {
      if (cb) cb();
      return;
    }
    if (fetched[fetchKey + ":pending"]) {
      setTimeout(function () { fetchEntity(type, name, cb); }, 100);
      return;
    }
    fetched[fetchKey + ":pending"] = true;
    fetch(API + ep)
      .then(function (r) { return r.json(); })
      .then(function (items) {
        items.forEach(function (item) {
          cache[type + ":" + item.name.toLowerCase()] = item;
          cache[type + ":" + item.id.toLowerCase()] = item;
        });
        fetched[fetchKey] = true;
        delete fetched[fetchKey + ":pending"];
        if (cb) cb();
      })
      .catch(function () {
        delete fetched[fetchKey + ":pending"];
      });
  }

  // --- DOM scanning ---
  var PATTERN = /\[\[(?:(card|relic|potion):)?([^\]]+)\]\]/g;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, INPUT: 1 };

  function scan(root) {
    root = root || document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    while (walker.nextNode()) {
      if (SKIP_TAGS[walker.currentNode.parentNode.tagName]) continue;
      if (walker.currentNode.nodeValue.indexOf("[[") >= 0) {
        nodes.push(walker.currentNode);
      }
    }

    var types = {};
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      var text = node.nodeValue;
      var lastIdx = 0;
      var match;
      PATTERN.lastIndex = 0;
      while ((match = PATTERN.exec(text)) !== null) {
        var type = match[1] || "card";
        var name = match[2];
        if (lastIdx < match.index) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
        }
        var a = document.createElement("a");
        a.className = "scx-link scx-" + type;
        a.href = SITE + "/" + type + "s/" + encodeURIComponent(name.toLowerCase().replace(/\s+/g, "_"));
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = name;
        a.setAttribute("data-scx-type", type);
        a.setAttribute("data-scx-name", name);
        a.addEventListener("mouseenter", function () { showTip(this, this.getAttribute("data-scx-type"), this.getAttribute("data-scx-name")); });
        a.addEventListener("mouseleave", hideTip);
        frag.appendChild(a);
        types[type] = true;
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }
      if (lastIdx > 0) {
        node.parentNode.replaceChild(frag, node);
      }
    });

    // Prefetch referenced entity types
    Object.keys(types).forEach(function (type) {
      fetchEntity(type, "", null);
    });
  }

  // --- Public API ---
  window.SpireCodex = { scan: scan };

  // --- Auto-init ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  } else {
    scan();
  }
})();
