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

  var token = sessionStorage.getItem("gh_token");
  var screenshots = [];
  var readmeCandidates = [];
  var lightSdk = false;
  var currentIssueNumber = new URLSearchParams(location.search).get("issue") || null;
  var currentUserLogin = null;
  var canEdit = true;

  var EDIT_LOCK_FIELD_IDS = [
    "name-input", "repo-url-input", "fetch-btn", "description-input",
    "category-input", "light-sdk-toggle", "long-description-input",
    "screenshot-url-input", "add-screenshot-btn",
  ];

  function lockForWrongAuthor(issueAuthor) {
    canEdit = false;
    EDIT_LOCK_FIELD_IDS.forEach(function(id) {
      var node = el(id);
      if (node.hasAttribute("contenteditable")) node.setAttribute("contenteditable", "false");
      else node.disabled = true;
    });
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
        el("submit-login").textContent = user.login;
      });
    } else {
      el("submit-login").textContent = "(local preview, not signed in)";
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

  function parseRepoUrl(url) {
    var m = (url || "").trim().replace(/\/+$/, "").match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  function humanize(slug) {
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); }).trim();
  }

  el("fetch-btn").addEventListener("click", function() {
    var parsed = parseRepoUrl(el("repo-url-input").value);
    if (!parsed) {
      el("fetch-status").textContent = "Invalid URL.";
      return;
    }
    el("fetch-status").textContent = "Fetching...";
    ghFetch("/repos/" + parsed.owner + "/" + parsed.repo)
      .then(function(repoData) {
        if (!el("name-input").value) el("name-input").value = humanize(repoData.name);
        if (!el("description-input").value) el("description-input").value = repoData.description || "";
        updatePreview();

        return ghFetch("/repos/" + parsed.owner + "/" + parsed.repo + "/readme").then(function(readme) {
          var text = atob(readme.content.replace(/\n/g, ""));
          var found = [];
          [MD_IMAGE_RE, IMG_TAG_RE].forEach(function(re) {
            var m;
            while ((m = re.exec(text))) found.push(m[1]);
          });
          readmeCandidates = found
            .filter(function(u) { return !BADGE_RE.test(u); })
            .map(function(u) {
              if (/^https?:\/\//.test(u)) return u;
              var cleanPath = u.replace(/^\.?\//, "");
              return "https://raw.githubusercontent.com/" + parsed.owner + "/" + parsed.repo + "/" + repoData.default_branch + "/" + cleanPath;
            })
            .filter(function(u, i, arr) { return arr.indexOf(u) === i; })
            .slice(0, 12);
          renderCandidates();
          el("fetch-status").textContent = "Fetched. Edit anything above before submitting.";
        });
      })
      .catch(function(err) {
        el("fetch-status").textContent = "Couldn't fetch that repo (" + err.message + "). Make sure it's public.";
      });
  });

  function renderCandidates() {
    var host = el("readme-candidates");
    host.innerHTML = "";
    host.style.display = readmeCandidates.length ? "flex" : "none";
    readmeCandidates.forEach(function(url) {
      var chip = document.createElement("div");
      chip.className = "imf-chip";
      chip.style.cursor = "pointer";
      chip.title = "Click to add";

      var img = document.createElement("img");
      img.src = url;
      img.style.width = "6rem";
      img.style.height = "6rem";
      img.style.objectFit = "cover";
      chip.appendChild(img);

      chip.addEventListener("click", function() { addScreenshot(url); });
      host.appendChild(chip);
    });
  }

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
    screenshots.forEach(function(url, i) {
      var img = document.createElement("img");
      img.src = url;
      img.className = "modal-media-item is-loaded";
      img.title = "Click to remove";
      img.addEventListener("click", function() {
        screenshots.splice(i, 1);
        renderScreenshots();
      });
      host.appendChild(img);
    });
    updatePreview();
    updateSubmitEnabled();
  }

  el("add-screenshot-btn").addEventListener("click", function() {
    addScreenshot(el("screenshot-url-input").value);
    el("screenshot-url-input").value = "";
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
  ["name-input", "category-input", "description-input"].forEach(function(id) {
    el(id).addEventListener("input", updateSubmitEnabled);
  });

  // ---- long description: live WYSIWYG markdown editor ---------------------
  // The long-description field is a contenteditable div. Typing markdown
  // syntax (**bold**, *italic*, "- " bullets, "# " headings, "> " quotes)
  // converts it to real formatting immediately, instead of showing raw
  // markdown next to a separate preview. htmlToMarkdown() turns the
  // resulting rich text back into markdown for the GitHub issue body;
  // markdownToHtml() does the reverse to hydrate the editor when loading
  // an existing submission.

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderInline(s) {
    s = escapeHtml(s);
    s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, function(m, a, b) { return "<strong>" + (a || b) + "</strong>"; });
    s = s.replace(/\*([^*]+)\*|_([^_]+)_/g, function(m, a, b) { return "<em>" + (a || b) + "</em>"; });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  function markdownToHtml(text) {
    var lines = (text || "").replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var listType = null;

    function closeList() {
      if (listType) { html.push("</" + listType + ">"); listType = null; }
    }

    lines.forEach(function(line) {
      var trimmed = line.trim();
      var bullet = trimmed.match(/^[-*+]\s+(.*)$/);
      var numbered = trimmed.match(/^\d+\.\s+(.*)$/);
      var heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      var quote = trimmed.match(/^>\s?(.*)$/);

      if (!trimmed) {
        closeList();
      } else if (heading) {
        closeList();
        var level = Math.min(heading[1].length + 2, 6); // keep below the card's own <h1>/<h2>
        html.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
      } else if (bullet) {
        if (listType !== "ul") { closeList(); html.push("<ul>"); listType = "ul"; }
        html.push("<li>" + renderInline(bullet[1]) + "</li>");
      } else if (numbered) {
        if (listType !== "ol") { closeList(); html.push("<ol>"); listType = "ol"; }
        html.push("<li>" + renderInline(numbered[1]) + "</li>");
      } else if (quote) {
        closeList();
        html.push("<blockquote>" + renderInline(quote[1]) + "</blockquote>");
      } else {
        closeList();
        html.push("<p>" + renderInline(trimmed) + "</p>");
      }
    });
    closeList();
    return html.join("\n") || "<p><br></p>";
  }

  function inlineToMarkdown(node) {
    var out = "";
    node.childNodes.forEach(function(child) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent.replace(/​/g, "");
      } else if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      } else {
        var tag = child.tagName.toLowerCase();
        if (tag === "strong" || tag === "b") out += "**" + inlineToMarkdown(child) + "**";
        else if (tag === "em" || tag === "i") out += "*" + inlineToMarkdown(child) + "*";
        else if (tag === "a") out += "[" + inlineToMarkdown(child) + "](" + child.getAttribute("href") + ")";
        else if (tag === "br") out += "\n";
        else out += inlineToMarkdown(child);
      }
    });
    return out;
  }

  function htmlToMarkdown(root) {
    var lines = [];
    root.childNodes.forEach(function(block) {
      if (block.nodeType === Node.TEXT_NODE) {
        var t = block.textContent.replace(/​/g, "").trim();
        if (t) lines.push(t, "");
        return;
      }
      if (block.nodeType !== Node.ELEMENT_NODE) return;
      var tag = block.tagName.toLowerCase();
      var headingMatch = tag.match(/^h([1-6])$/);
      if (headingMatch) {
        var level = Math.max(1, headingMatch[1] - 2); // inverse of markdownToHtml's +2 shift
        lines.push("#".repeat(level) + " " + inlineToMarkdown(block).trim(), "");
      } else if (tag === "blockquote") {
        lines.push("> " + inlineToMarkdown(block).trim(), "");
      } else if (tag === "ul" || tag === "ol") {
        var i = 0;
        block.childNodes.forEach(function(li) {
          if (li.nodeType !== Node.ELEMENT_NODE || li.tagName.toLowerCase() !== "li") return;
          i++;
          var prefix = tag === "ul" ? "- " : (i + ". ");
          lines.push(prefix + inlineToMarkdown(li).trim());
        });
        lines.push("");
      } else if (tag === "br") {
        lines.push("");
      } else {
        var text = inlineToMarkdown(block).trim();
        if (text) lines.push(text, "");
      }
    });
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  function setLongDescriptionMarkdown(text) {
    el("long-description-input").innerHTML = markdownToHtml(text);
  }

  function getLongDescriptionMarkdown() {
    return htmlToMarkdown(el("long-description-input"));
  }

  // -- live inline conversion: **bold** / __bold__ / *italic* / _italic_ ----

  function tryInlineMarkdown(editorEl) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    var node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editorEl.contains(node)) return;

    var text = node.textContent.slice(0, range.startOffset);
    var tagName = null, match = null;

    match = text.match(/\*\*([^*\n]+)\*\*$/) || text.match(/__([^_\n]+)__$/);
    if (match) tagName = "strong";

    if (!match) {
      var em = text.match(/\*([^*\n]+)\*$/);
      var delim = "*";
      if (!em) { em = text.match(/_([^_\n]+)_$/); delim = "_"; }
      if (em) {
        var openIdx = text.length - em[0].length;
        if (!(openIdx > 0 && text[openIdx - 1] === delim)) {
          match = em;
          tagName = "em";
        }
      }
    }
    if (!match) return;

    var matchStart = range.startOffset - match[0].length;
    var before = node.textContent.slice(0, matchStart);
    var after = node.textContent.slice(range.startOffset);

    var parent = node.parentNode;
    var beforeNode = document.createTextNode(before);
    var inlineEl = document.createElement(tagName);
    inlineEl.textContent = match[1];
    var afterNode = document.createTextNode(after || "​");

    parent.replaceChild(afterNode, node);
    parent.insertBefore(inlineEl, afterNode);
    parent.insertBefore(beforeNode, inlineEl);

    var newRange = document.createRange();
    newRange.setStart(afterNode, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  // -- live block conversion: "- "/"1. " lists, "# " headings, "> " quotes -

  function tryBlockMarkdown(editorEl) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    var node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    var block = node.parentNode;
    if (block.childNodes.length !== 1 || block.firstChild !== node) return;
    if (block === editorEl || !editorEl.contains(block)) return;
    if (range.startOffset !== node.textContent.length) return;

    var text = node.textContent;
    var bullet = text.match(/^[-*]\s$/);
    var numbered = text.match(/^\d+\.\s$/);
    var heading = text.match(/^(#{1,6})\s$/);
    var quote = text.match(/^>\s$/);
    if (!bullet && !numbered && !heading && !quote) return;

    var targetParent = block.parentNode;
    var newBlock;

    if (bullet || numbered) {
      var listType = bullet ? "ul" : "ol";
      var prev = block.previousSibling;
      var list = (prev && prev.nodeType === Node.ELEMENT_NODE && prev.tagName.toLowerCase() === listType)
        ? prev
        : targetParent.insertBefore(document.createElement(listType), block);
      newBlock = document.createElement("li");
      list.appendChild(newBlock);
    } else if (heading) {
      newBlock = document.createElement("h" + Math.min(heading[1].length + 2, 6));
      targetParent.insertBefore(newBlock, block);
    } else {
      newBlock = document.createElement("blockquote");
      targetParent.insertBefore(newBlock, block);
    }

    var textNode = document.createTextNode("​");
    newBlock.appendChild(textNode);
    targetParent.removeChild(block);

    var newRange = document.createRange();
    newRange.setStart(textNode, textNode.textContent.length);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  // -- Enter key: always start a fresh top-level block, or continue a list -

  function handleEditorEnter(editorEl, e) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var node = range.startContainer;
    var block = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    if (!editorEl.contains(block)) return;

    e.preventDefault();

    var li = block.closest ? block.closest("li") : null;
    if (li) {
      if (li.textContent.replace(/​/g, "").trim() === "") {
        var list = li.parentNode;
        var p = document.createElement("p");
        p.appendChild(document.createTextNode("​"));
        list.parentNode.insertBefore(p, list.nextSibling);
        list.removeChild(li);
        if (!list.childNodes.length) list.parentNode.removeChild(list);
        placeCaret(p.firstChild, 0);
      } else {
        var newLi = document.createElement("li");
        newLi.appendChild(document.createTextNode("​"));
        li.parentNode.insertBefore(newLi, li.nextSibling);
        placeCaret(newLi.firstChild, 0);
      }
      return;
    }

    var blockEl = block === editorEl ? null : block;
    var newP = document.createElement("p");
    newP.appendChild(document.createTextNode("​"));
    if (blockEl) {
      blockEl.parentNode.insertBefore(newP, blockEl.nextSibling);
    } else {
      editorEl.appendChild(newP);
    }
    placeCaret(newP.firstChild, 0);
  }

  function placeCaret(node, offset) {
    var sel = window.getSelection();
    var range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  (function initLongDescriptionEditor() {
    var editor = el("long-description-input");

    function updateEmptyState() {
      editor.classList.toggle("is-empty", editor.textContent.replace(/​/g, "").trim() === "");
    }

    editor.addEventListener("keydown", function(e) {
      if (e.key === "Enter") handleEditorEnter(editor, e);
    });
    editor.addEventListener("input", function() {
      tryInlineMarkdown(editor);
      tryBlockMarkdown(editor);
      updateEmptyState();
    });
    updateEmptyState();
  })();

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
