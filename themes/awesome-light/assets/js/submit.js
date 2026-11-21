(function() {
  // ---- fill in once the Worker is deployed ---------------------------------
  var CLIENT_ID = "Iv23liEo88RcasuPcKqi";
  var WORKER_URL = "https://rough-limit-9460.alexisgarado.workers.dev";
  // ---------------------------------------------------------------------------

  var REPO_OWNER = "garado";
  var REPO_NAME = "awesome-light-staging";
  // Must exactly match the callback URL registered on the GitHub OAuth App -
  // hardcoded (not derived from location) since Hugo serves this page with a
  // trailing slash and a mismatch here is a hard GitHub-side rejection.
  var REDIRECT_URI = "https://awesome-light-staging.garado.dev/submit/";

  var el = function(id) { return document.getElementById(id); };
  var showError = function(msg) {
    var box = el("submit-error");
    box.textContent = msg;
    box.style.display = "block";
  };

  // A real damped mass-spring-damper simulation (not a fixed easing curve) -
  // this is what gives UIKit-style motion its slight overshoot-then-settle
  // feel, which cubic-bezier can only ever approximate for one specific
  // distance/duration combination.
  function animateSpring(opts) {
    var pos = opts.from;
    var vel = 0;
    var target = opts.to;
    var stiffness = opts.stiffness;
    var damping = opts.damping;
    var mass = opts.mass || 1;
    var lastTime = null;

    function frame(now) {
      if (lastTime === null) lastTime = now;
      var dt = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;

      var accel = (-stiffness * (pos - target) - damping * vel) / mass;
      vel += accel * dt;
      pos += vel * dt;
      opts.onUpdate(pos);

      if (Math.abs(pos - target) < 0.01 && Math.abs(vel) < 0.01) {
        opts.onUpdate(target);
        if (opts.onComplete) opts.onComplete();
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // createToast() returns a handle so a single toast can be updated in place
  // (e.g. "Fetching..." -> "Fetched.") instead of spawning a new one per
  // message. showToast() is the one-shot convenience wrapper around it.

  function createToast(msg) {
    var host = document.getElementById("toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      document.body.appendChild(host);
    }
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = msg;
    host.appendChild(toast);

    var state = { y: 24, opacity: 0 };
    var dismissTimer = null;
    function render() {
      toast.style.transform = "translateY(" + state.y + "px)";
      toast.style.opacity = state.opacity;
    }
    render();

    animateSpring({ from: 24, to: 0, stiffness: 300, damping: 26, onUpdate: function(y) { state.y = y; render(); } });
    animateSpring({ from: 0, to: 1, stiffness: 300, damping: 34, onUpdate: function(o) { state.opacity = o; render(); } });

    function dismiss() {
      animateSpring({
        from: state.y, to: 24, stiffness: 300, damping: 30,
        onUpdate: function(y) { state.y = y; render(); },
        onComplete: function() { toast.remove(); },
      });
      animateSpring({ from: state.opacity, to: 0, stiffness: 300, damping: 34, onUpdate: function(o) { state.opacity = o; render(); } });
    }

    return {
      update: function(newMsg) { toast.textContent = newMsg; },
      dismissAfter: function(ms) {
        clearTimeout(dismissTimer);
        dismissTimer = setTimeout(dismiss, ms);
      },
    };
  }

  function showToast(msg) {
    createToast(msg).dismissAfter(2500);
  }

  var token = sessionStorage.getItem("gh_token");
  var screenshots = [];
  var lightSdk = false;
  var currentIssueNumber = new URLSearchParams(location.search).get("issue") || null;
  var currentUserLogin = null;
  var canEdit = true;

  var EDIT_LOCK_FIELD_IDS = [
    "name-input", "repo-url-input", "fetch-btn", "description-input",
    "category-input", "light-sdk-toggle",
    "screenshot-url-input", "add-screenshot-btn",
  ];

  function lockForWrongAuthor(issueAuthor) {
    canEdit = false;
    EDIT_LOCK_FIELD_IDS.forEach(function(id) {
      var node = el(id);
      if (node.hasAttribute("contenteditable")) node.setAttribute("contenteditable", "false");
      else node.disabled = true;
    });
    var longDescNode = document.querySelector(".long-description-editor");
    longDescNode.style.pointerEvents = "none";
    longDescNode.style.opacity = "0.6";
    if (longDescNode.disabled !== undefined) longDescNode.disabled = true;
    el("submit-btn").disabled = true;
    showError("This submission belongs to " + issueAuthor + " - only they can edit it. You can still look around, but Submit is disabled.");
  }

  function ghFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      Accept: "application/vnd.github+json",
    }, token ? { Authorization: "token " + token } : {}, opts.headers || {});
    return fetch("https://api.github.com" + path, opts).then(function(res) {
      return res.json().then(function(data) {
        if (!res.ok) throw new Error(data.message || ("GitHub API error " + res.status));
        return data;
      });
    });
  }

  // ---- OAuth ----------------------------------------------------------------

  el("login-btn").addEventListener("click", function() {
    var state = crypto.randomUUID();
    sessionStorage.setItem("oauth_state", state);
    var url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("state", state);
    location.href = url.toString();
  });

  function completeLogin(code, state) {
    var expected = sessionStorage.getItem("oauth_state");
    sessionStorage.removeItem("oauth_state");
    if (!expected || state !== expected) {
      showError("Login didn't verify - try signing in again.");
      return;
    }
    history.replaceState({}, "", REDIRECT_URI + (currentIssueNumber ? ("?issue=" + currentIssueNumber) : ""));

    fetch(WORKER_URL + "/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code }),
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.error) { showError(data.error); return; }
        token = data.access_token;
        sessionStorage.setItem("gh_token", token);
        showSignedIn();
      })
      .catch(function() { showError("Could not reach the login service. Try again shortly."); });
  }

  function showSignedIn() {
    el("signed-out").style.display = "none";
    el("signed-out-hint").style.display = "none";
    el("signed-in").style.display = "block";

    var userPromise;
    if (token) {
      userPromise = ghFetch("/user").then(function(user) {
        currentUserLogin = user.login;
        el("submit-btn").textContent = "Submit as @" + user.login;
      });
    } else {
      userPromise = Promise.resolve();
    }

    if (currentIssueNumber) {
      userPromise.then(function() { loadExistingIssue(currentIssueNumber); });
    } else {
      renderScreenshots();
    }
  }

  var params = new URLSearchParams(location.search);
  if (params.get("code")) {
    completeLogin(params.get("code"), params.get("state"));
  } else if (token) {
    showSignedIn();
  } else if (params.get("dev") === "1") {
    // Visual-only local preview - no OAuth, no write access. Unauthenticated
    // GitHub API reads still work (lower rate limit), submitting will not.
    showSignedIn();
  }

  // ---- fetching repo info -----------------------------------------------

  var BADGE_RE = /badge|shields\.io|badgen\.net|codecov|coveralls|\.svg(?:[?#]|$)/i;
  var MD_IMAGE_RE = /!\[[^\]]*\]\(\s*"?([^"\s)]+)"?(?:\s+"[^"]*")?\s*\)/g;
  var IMG_TAG_RE = /<img\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  var IMG_TAG_FULL_RE = /<img\b[^>]*\/?>/gi;

  function parseRepoUrl(url) {
    var m = (url || "").trim().replace(/\/+$/, "").match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  function humanize(slug) {
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); }).trim();
  }

  // ---- already-published check: if this repo is already a live listing, --
  // ---- prefill from its index.md and submitting will update it instead ---
  // ---- of the backend bailing with "already on the list" (add-submission --
  // ---- .yml now updates in that case rather than refusing). -------------

  function parsePublishedEntry(raw) {
    var end = raw.indexOf("\n---", 4);
    var fm = raw.slice(4, end);
    var body = raw.slice(end + 4).replace(/^\s*\n/, "");

    function scalar(key) {
      var m = fm.match(new RegExp("^" + key + ":\\s*(.*)$", "m"));
      return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : "";
    }

    var images = [];
    var imgSection = fm.match(/^images:\n((?:\s*-\s*.*\n?)*)/m);
    if (imgSection) {
      imgSection[1].split("\n").forEach(function(line) {
        var m = line.match(/^\s*-\s*"?([^"\n]+)"?\s*$/);
        if (m) images.push(m[1]);
      });
    }

    return {
      category: scalar("category"),
      lightSdk: scalar("light_sdk") === "true",
      description: scalar("description"),
      images: images,
      body: body.trim(),
    };
  }

  function findPublishedEntry(parsed) {
    var url = "https://github.com/" + parsed.owner + "/" + parsed.repo;
    var q = encodeURIComponent("\"" + url + "\" in:file path:content/apps repo:" + REPO_OWNER + "/" + REPO_NAME);
    return ghFetch("/search/code?q=" + q)
      .then(function(result) {
        var hit = result.items && result.items[0];
        if (!hit) return null;
        return ghFetch("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/contents/" + hit.path + "?ref=main")
          .then(function(file) {
            var entry = parsePublishedEntry(atob(file.content.replace(/\n/g, "")));
            entry.dirName = hit.path.split("/")[1];
            return entry;
          });
      })
      .catch(function() { return null; });
  }

  el("fetch-btn").addEventListener("click", function() {
    var parsed = parseRepoUrl(el("repo-url-input").value);
    if (!parsed) {
      showToast("That doesn't look like a github.com/owner/repo URL.");
      return;
    }
    var toast = createToast("Fetching...");

    findPublishedEntry(parsed)
      .then(function(entry) {
        return ghFetch("/repos/" + parsed.owner + "/" + parsed.repo)
          .then(function(repoData) {
            if (!el("name-input").value) el("name-input").value = humanize(repoData.name);
            updatePreview();

            if (entry) {
              if (entry.category) el("category-input").value = entry.category;
              lightSdk = entry.lightSdk;
              el("light-sdk-toggle").textContent = "made with light sdk: " + (lightSdk ? "yes" : "no");
              el("light-sdk-toggle").dataset.value = lightSdk ? "Yes" : "No";
              if (!el("description-input").value) el("description-input").value = entry.description;
              if (getLongDescriptionMarkdown().trim() === "") setLongDescriptionMarkdown(entry.body);
              entry.images.forEach(function(ref) {
                addScreenshot(/^https?:\/\//.test(ref)
                  ? ref
                  : "https://raw.githubusercontent.com/" + REPO_OWNER + "/" + REPO_NAME + "/main/content/apps/" + entry.dirName + "/" + ref);
              });

              toast.update("Found an existing listing for this app - editing it. Submitting will update it.");
              toast.dismissAfter(3500);
              return;
            }

            if (!el("description-input").value) el("description-input").value = repoData.description || "";

            return ghFetch("/repos/" + parsed.owner + "/" + parsed.repo + "/readme").then(function(readme) {
              var text = atob(readme.content.replace(/\n/g, ""));
              var readmeDir = readme.path.replace(/\/[^/]*$/, "");
              if (readmeDir === readme.path) readmeDir = ""; // README is at repo root, no directory prefix
              var found = [];
              [MD_IMAGE_RE, IMG_TAG_RE].forEach(function(re) {
                var m;
                while ((m = re.exec(text))) found.push(m[1]);
              });
              found
                .filter(function(u) { return !BADGE_RE.test(u); })
                .map(function(u) {
                  if (/^https?:\/\//.test(u)) return u;
                  var cleanPath = (readmeDir ? readmeDir + "/" : "") + u.replace(/^\.?\//, "");
                  return "https://raw.githubusercontent.com/" + parsed.owner + "/" + parsed.repo + "/" + repoData.default_branch + "/" + cleanPath;
                })
                .filter(function(u, i, arr) { return arr.indexOf(u) === i; })
                .slice(0, 12)
                .forEach(addScreenshot);

              var isLongDescEmpty = getLongDescriptionMarkdown().trim() === "";
              if (isLongDescEmpty) {
                var descText = text;
                [MD_IMAGE_RE, IMG_TAG_FULL_RE].forEach(function(re) { descText = descText.replace(re, ""); });
                descText = descText.replace(/\n{3,}/g, "\n\n").trim();
                if (descText) setLongDescriptionMarkdown(descText);
              }

              toast.update("Fetched. Edit anything above before submitting.");
              toast.dismissAfter(2500);
            });
          });
      })
      .catch(function(err) {
        toast.update("Couldn't fetch that repo (" + err.message + "). Make sure it's public.");
        toast.dismissAfter(4000);
      });
  });

  // ---- screenshots: rendered directly as the modal's media row -----------

  function addScreenshot(url) {
    url = (url || "").trim();
    if (!url || screenshots.indexOf(url) !== -1) return;
    screenshots.push(url);
    renderScreenshots();
  }

  function renderScreenshots() {
    var host = el("modal-media");
    host.innerHTML = "";
    screenshots.forEach(function(url) {
      var img = document.createElement("img");
      img.src = url;
      img.className = "modal-media-item is-loaded";
      img.title = "Manage screenshots";
      img.addEventListener("click", openImageManager);
      host.appendChild(img);
    });

    var addTile = document.createElement("button");
    addTile.type = "button";
    addTile.className = "modal-media-add";
    addTile.textContent = "+";
    addTile.title = "Manage screenshots";
    addTile.addEventListener("click", openImageManager);
    host.appendChild(addTile);

    updatePreview();
    updateSubmitEnabled();
  }

  // ---- image manager modal: grid view, drag-to-reorder, delete, add-by-URL

  var dragFromIndex = null;

  function renderImageManagerGrid() {
    var grid = el("img-mgr-grid");
    grid.innerHTML = "";
    screenshots.forEach(function(url, i) {
      var item = document.createElement("div");
      item.className = "img-mgr-item";
      item.draggable = true;

      var img = document.createElement("img");
      img.src = url;
      item.appendChild(img);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "img-mgr-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove";
      removeBtn.addEventListener("click", function() {
        screenshots.splice(i, 1);
        renderImageManagerGrid();
        renderScreenshots();
      });
      item.appendChild(removeBtn);

      item.addEventListener("dragstart", function() {
        dragFromIndex = i;
        item.classList.add("is-dragging");
      });
      item.addEventListener("dragend", function() {
        item.classList.remove("is-dragging");
      });
      item.addEventListener("dragover", function(e) {
        e.preventDefault();
        item.classList.add("is-drop-target");
      });
      item.addEventListener("dragleave", function() {
        item.classList.remove("is-drop-target");
      });
      item.addEventListener("drop", function(e) {
        e.preventDefault();
        item.classList.remove("is-drop-target");
        if (dragFromIndex === null || dragFromIndex === i) return;
        var moved = screenshots.splice(dragFromIndex, 1)[0];
        screenshots.splice(i, 0, moved);
        dragFromIndex = null;
        renderImageManagerGrid();
        renderScreenshots();
      });

      grid.appendChild(item);
    });
  }

  function openImageManager() {
    renderImageManagerGrid();
    el("screenshot-url-input").value = "";
    el("image-manager-overlay").classList.add("open");
  }

  function closeImageManager() {
    el("image-manager-overlay").classList.remove("open");
  }

  el("add-screenshot-btn").addEventListener("click", function() {
    addScreenshot(el("screenshot-url-input").value);
    el("screenshot-url-input").value = "";
    renderImageManagerGrid();
  });
  el("screenshot-url-input").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      el("add-screenshot-btn").click();
    }
  });
  el("image-manager-done-btn").addEventListener("click", closeImageManager);
  el("image-manager-overlay").addEventListener("click", function(e) {
    if (e.target === el("image-manager-overlay")) closeImageManager();
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && el("image-manager-overlay").classList.contains("open")) closeImageManager();
  });

  // ---- light sdk toggle ---------------------------------------------------

  el("light-sdk-toggle").addEventListener("click", function() {
    lightSdk = !lightSdk;
    el("light-sdk-toggle").textContent = "made with light sdk: " + (lightSdk ? "yes" : "no");
    el("light-sdk-toggle").dataset.value = lightSdk ? "Yes" : "No";
  });

  // ---- author line + live bits --------------------------------------------

  function updatePreview() {
    var parsed = parseRepoUrl(el("repo-url-input").value);
    el("modal-author-line").textContent = parsed ? parsed.owner : "";
  }

  ["repo-url-input"].forEach(function(id) {
    el(id).addEventListener("input", function() { updatePreview(); });
  });
  el("repo-url-input").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      el("fetch-btn").click();
    }
  });
  ["name-input", "category-input", "description-input"].forEach(function(id) {
    el(id).addEventListener("input", updateSubmitEnabled);
  });

  // ---- long description: Tiptap (ProseMirror), no toolbar of its own -----
  // No toolbar/chrome is rendered - the editable area reuses .modal-body, the
  // same class the real app page uses to render descriptions, so typing
  // **bold**/# heading/- list (Tiptap's built-in input rules, not hand-rolled
  // caret math) produces something that already looks like the final page.
  // Loaded via dynamic import since there's no bundler in this project and
  // Tiptap doesn't ship a single-file browser build the way Toast UI did.

  var longDescEditor = null;
  var longDescFallback = null; // plain <textarea>, used only if Tiptap fails to load
  var pendingLongDescMarkdown = null;
  var LONG_DESC_PLACEHOLDER = "Longer description to show in the popup. If left blank, it reuses the one-sentence summary.";

  // jsDelivr, not esm.sh: it resolves each package's dependency versions
  // deterministically at build time (no range-guessing across requests), so
  // all four packages land on the exact same @tiptap/core without needing
  // esm.sh's ?deps= override hack. 2.2.4 (not latest) because that's the
  // @tiptap/core version tiptap-markdown itself actually resolves to.
  var TIPTAP_CORE_VERSION = "2.2.4";
  var MARKDOWN_EXT_VERSION = "0.8.10";

  function loadTiptapModules() {
    return Promise.all([
      import("https://cdn.jsdelivr.net/npm/@tiptap/core@" + TIPTAP_CORE_VERSION + "/+esm"),
      import("https://cdn.jsdelivr.net/npm/@tiptap/starter-kit@" + TIPTAP_CORE_VERSION + "/+esm"),
      import("https://cdn.jsdelivr.net/npm/@tiptap/extension-placeholder@" + TIPTAP_CORE_VERSION + "/+esm"),
      import("https://cdn.jsdelivr.net/npm/tiptap-markdown@" + MARKDOWN_EXT_VERSION + "/+esm"),
    ]);
  }

  function useFallbackTextarea() {
    if (longDescFallback) return;
    var textarea = document.createElement("textarea");
    textarea.id = "long-description-input";
    textarea.className = "submit-input submit-input--body modal-body long-description-editor";
    textarea.rows = 4;
    textarea.placeholder = LONG_DESC_PLACEHOLDER + " (plain text - the rich editor failed to load)";
    textarea.value = pendingLongDescMarkdown || "";
    el("long-description-editor").replaceWith(textarea);
    longDescFallback = textarea;
  }

  (async function initLongDescEditor() {
    var modules;
    try {
      modules = await loadTiptapModules();
    } catch (err) {
      try {
        modules = await loadTiptapModules(); // one retry - transient CDN hiccups happen
      } catch (err2) {
        console.error("Rich text editor failed to load, falling back to plain text:", err2);
        useFallbackTextarea();
        return;
      }
    }

    var Editor = modules[0].Editor;
    var StarterKit = modules[1].default;
    var Placeholder = modules[2].default;
    var Markdown = modules[3].Markdown;

    longDescEditor = new Editor({
      element: el("long-description-editor"),
      extensions: [
        StarterKit,
        Markdown.configure({ html: false }),
        Placeholder.configure({ placeholder: LONG_DESC_PLACEHOLDER }),
      ],
      content: pendingLongDescMarkdown || "",
    });
  })();

  function setLongDescriptionMarkdown(text) {
    if (longDescFallback) { longDescFallback.value = text || ""; return; }
    if (!longDescEditor) { pendingLongDescMarkdown = text || ""; return; }
    longDescEditor.commands.setContent(text || "");
  }

  function getLongDescriptionMarkdown() {
    if (longDescFallback) return longDescFallback.value;
    return longDescEditor ? longDescEditor.storage.markdown.getMarkdown() : (pendingLongDescMarkdown || "");
  }

  function updateSubmitEnabled() {
    var ok = canEdit &&
      el("name-input").value.trim() &&
      el("category-input").value &&
      el("description-input").value.trim() &&
      screenshots.length > 0;
    el("submit-btn").disabled = !ok;
  }

  // ---- building and sending the issue -------------------------------------

  function buildBody(issueNumber) {
    var lines = [];
    lines.push("### App name", "", el("name-input").value.trim(), "");
    lines.push("### Repository URL", "", el("repo-url-input").value.trim(), "");
    lines.push("### Category", "", el("category-input").value, "");
    lines.push("### Built with the Light SDK?", "", el("light-sdk-toggle").dataset.value, "");
    lines.push("### Short description", "", el("description-input").value.trim(), "");
    lines.push("### Long description", "", getLongDescriptionMarkdown().trim() || "_No response_", "");
    lines.push("### Screenshots", "", screenshots.join("\n"), "");
    if (issueNumber) {
      lines.push("### Edit this submission", "", REDIRECT_URI + "?issue=" + issueNumber, "");
    }
    return lines.join("\n");
  }

  function field(body, label) {
    var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("### " + escaped + "\\s*\\n\\s*([^\\n]*(?:\\n(?!### )[^\\n]*)*)", "i");
    var m = body.match(re);
    if (!m) return "";
    var v = m[1].trim();
    return v === "_No response_" ? "" : v;
  }

  function loadExistingIssue(number) {
    ghFetch("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues/" + number)
      .then(function(issue) {
        var body = issue.body || "";
        el("name-input").value = field(body, "App name");
        el("repo-url-input").value = field(body, "Repository URL");
        el("category-input").value = field(body, "Category");
        lightSdk = field(body, "Built with the Light SDK?") === "Yes";
        el("light-sdk-toggle").textContent = "made with light sdk: " + (lightSdk ? "yes" : "no");
        el("light-sdk-toggle").dataset.value = lightSdk ? "Yes" : "No";
        el("description-input").value = field(body, "Short description");
        setLongDescriptionMarkdown(field(body, "Long description"));
        screenshots = field(body, "Screenshots").split("\n").map(function(s) { return s.trim(); }).filter(Boolean);
        renderScreenshots();
        updatePreview();
        el("submit-btn").textContent = "Update submission";
        el("submit-result").innerHTML = 'Editing <a href="' + issue.html_url + '" target="_blank">issue #' + number + "</a>.";

        if (token && currentUserLogin && issue.user && issue.user.login !== currentUserLogin) {
          lockForWrongAuthor(issue.user.login);
        }
      })
      .catch(function(err) {
        showError("Couldn't load issue #" + number + " (" + err.message + ").");
      });
  }

  el("submit-btn").addEventListener("click", function() {
    el("submit-btn").disabled = true;
    var payload = {
      title: (currentIssueNumber ? "" : "New submission: ") + el("name-input").value.trim(),
      body: buildBody(currentIssueNumber),
      labels: ["submission"],
    };

    var req = currentIssueNumber
      ? ghFetch("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues/" + currentIssueNumber, {
        method: "PATCH",
        body: JSON.stringify({ title: payload.title, body: payload.body }),
      })
      : ghFetch("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues", {
        method: "POST",
        body: JSON.stringify(payload),
      });

    req
      .then(function(issue) {
        var isNew = !currentIssueNumber;
        currentIssueNumber = issue.number;
        history.replaceState({}, "", REDIRECT_URI + "?issue=" + issue.number);

        var finish = isNew
          ? ghFetch("/repos/" + REPO_OWNER + "/" + REPO_NAME + "/issues/" + issue.number, {
            method: "PATCH",
            body: JSON.stringify({ body: buildBody(issue.number) }),
          })
          : Promise.resolve();

        return finish.then(function() {
          el("submit-result").innerHTML = 'Done - <a href="' + issue.html_url + '" target="_blank">view issue #' + issue.number + "</a>. A bot will open a PR shortly; come back to this page to edit before it's reviewed.";
          el("submit-btn").textContent = "Update submission";
        });
      })
      .catch(function(err) {
        showError("Couldn't submit (" + err.message + ").");
      })
      .finally(function() { updateSubmitEnabled(); });
  });
})();
