/**
 * Spire Codex Changelog Widget v1.0
 * Embeddable patch notes / changelog viewer for Slay the Spire 2.
 *
 * Usage:
 *   <div id="scx-changelog"></div>
 *   <script src="https://spire-codex.com/widget/spire-codex-changelog.js"></script>
 *
 * Options (via data attributes on the script tag):
 *   data-version="1.0.4"  — show a specific version (default: latest)
 *   data-api="https://spire-codex.com" — override API base URL
 */
(function () {
  "use strict";

  var API = "https://spire-codex.com";
  var SITE = "https://spire-codex.com";
  var version = null;

  var tag = document.currentScript;
  if (tag) {
    API = tag.getAttribute("data-api") || API;
    SITE = tag.getAttribute("data-site") || SITE;
    version = tag.getAttribute("data-version") || null;
  }

  var STYLE_ID = "scx-changelog-styles";
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#scx-changelog{font-family:-apple-system,system-ui,sans-serif;background:#1a1a1f;border:1px solid #2a2a30;border-radius:10px;padding:20px;color:#e8e6e3;max-width:640px;font-size:14px}" +
      "#scx-changelog h2{margin:0 0 4px;font-size:18px;color:#d4a843}" +
      "#scx-changelog .scx-cl-date{font-size:12px;color:#6b6560;margin-bottom:12px}" +
      "#scx-changelog .scx-cl-select{background:#12121a;border:1px solid #2a2a30;color:#e8e6e3;padding:4px 8px;border-radius:6px;font-size:12px;margin-bottom:12px;cursor:pointer}" +
      "#scx-changelog .scx-cl-section{margin-bottom:12px}" +
      "#scx-changelog .scx-cl-section h3{font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b6560;margin:0 0 6px;font-weight:600}" +
      "#scx-changelog ul{margin:0;padding:0 0 0 18px;list-style:disc}" +
      "#scx-changelog li{margin-bottom:4px;font-size:13px;color:#b0ada8;line-height:1.5}" +
      "#scx-changelog .scx-cl-badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;margin-right:6px}" +
      "#scx-changelog .scx-cl-added{background:#064e3b;color:#6ee7b7}" +
      "#scx-changelog .scx-cl-fixed{background:#7f1d1d;color:#fca5a5}" +
      "#scx-changelog .scx-cl-api{background:#1e3a5f;color:#93c5fd}" +
      "#scx-changelog .scx-cl-attr{text-align:right;margin-top:12px;font-size:10px}" +
      "#scx-changelog .scx-cl-attr a{color:#6b6560;text-decoration:none}" +
      "#scx-changelog .scx-cl-attr a:hover{color:#d4a843}" +
      "#scx-changelog .scx-cl-loading{color:#6b6560;text-align:center;padding:20px}";
    document.head.appendChild(style);
  }

  var container = document.getElementById("scx-changelog");
  if (!container) return;

  container.innerHTML =
    '<div class="scx-cl-loading">Loading changelog\u2026</div>';

  fetch(API + "/api/changelogs")
    .then(function (r) {
      return r.json();
    })
    .then(function (versions) {
      if (!versions.length) {
        container.innerHTML = "<p>No changelogs available.</p>";
        return;
      }

      var targetTag = version || versions[0].tag;
      renderVersion(targetTag, versions);
    })
    .catch(function () {
      container.innerHTML = "<p>Failed to load changelog.</p>";
    });

  function renderVersion(tag, versions) {
    fetch(API + "/api/changelogs/" + encodeURIComponent(tag))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var html = "";

        // Version selector
        html += '<select class="scx-cl-select" id="scx-cl-version">';
        versions.forEach(function (v) {
          html +=
            '<option value="' +
            esc(v.tag) +
            '"' +
            (v.tag === tag ? " selected" : "") +
            ">" +
            esc(v.tag) +
            " — " +
            esc(v.title || v.tag) +
            "</option>";
        });
        html += "</select>";

        html += "<h2>" + esc(data.title || data.game_version) + "</h2>";
        html +=
          '<div class="scx-cl-date">' +
          esc(data.date || "") +
          " &middot; v" +
          esc(data.game_version) +
          "</div>";

        if (data.features && data.features.length) {
          html +=
            '<div class="scx-cl-section"><h3><span class="scx-cl-badge scx-cl-added">NEW</span> Features</h3><ul>';
          data.features.forEach(function (f) {
            html += "<li>" + esc(f) + "</li>";
          });
          html += "</ul></div>";
        }

        if (data.fixes && data.fixes.length) {
          html +=
            '<div class="scx-cl-section"><h3><span class="scx-cl-badge scx-cl-fixed">FIX</span> Fixes</h3><ul>';
          data.fixes.forEach(function (f) {
            html += "<li>" + esc(f) + "</li>";
          });
          html += "</ul></div>";
        }

        if (data.api_changes && data.api_changes.length) {
          html +=
            '<div class="scx-cl-section"><h3><span class="scx-cl-badge scx-cl-api">API</span> API Changes</h3><ul>';
          data.api_changes.forEach(function (f) {
            html += "<li>" + esc(f) + "</li>";
          });
          html += "</ul></div>";
        }

        html +=
          '<div class="scx-cl-attr"><a href="' +
          SITE +
          '/changelog" target="_blank" rel="noopener">Full changelog on Spire Codex</a></div>';

        container.innerHTML = html;

        // Bind version selector
        var select = document.getElementById("scx-cl-version");
        if (select) {
          select.addEventListener("change", function () {
            renderVersion(this.value, versions);
          });
        }
      });
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
})();
