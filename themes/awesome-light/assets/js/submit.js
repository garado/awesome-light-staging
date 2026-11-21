(function () {
  // ---- fill in once the Worker is deployed ---------------------------------
  var CLIENT_ID = "Ov23lifjO1KWm8keowOt";
  var WORKER_URL = "https://rough-limit-9460.alexisgarado.workers.dev";
  // ---------------------------------------------------------------------------

  var REPO_OWNER = "garado";
  var REPO_NAME = "awesome-light-staging";
  // Must exactly match the callback URL registered on the GitHub OAuth App -
  // hardcoded (not derived from location) since Hugo serves this page with a
  // trailing slash and a mismatch here is a hard GitHub-side rejection.
  var REDIRECT_URI = "https://awesome-light-staging.garado.dev/submit/";

  var el = function (id) { return document.getElementById(id); };
  var showError = function (msg) {
    var box = el("submit-error");
    box.textContent = msg;
    box.style.display = "block";
  };

  var token = sessionStorage.getItem("gh_token");
  var screenshots = [];
  var readmeCandidates = [];
  var lightSdk = false;
  var currentIssueNumber = new URLSearchParams(location.search).get("issue") || null;

  function ghFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      Accept: "application/vnd.github+json",
    }, token ? { Authorization: "token " + token } : {}, opts.headers || {});
    return fetch("https://api.github.com" + path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.message || ("GitHub API error " + res.status));
        return data;
      });
    });
  }

  // ---- OAuth ----------------------------------------------------------------

  el("login-btn").addEventListener("click", function () {
    var state = crypto.randomUUID();
    sessionStorage.setItem("oauth_state", state);
    var url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("scope", "public_repo");
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
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) { showError(data.error); return; }
        token = data.access_token;
        sessionStorage.setItem("gh_token", token);
        showSignedIn();
      })
      .catch(function () { showError("Could not reach the login service. Try again shortly."); });
  }

  function showSignedIn() {
    el("signed-out").style.display = "none";
    el("signed-out-hint").style.display = "none";
    el("signed-in").style.display = "block";
    if (token) {
      ghFetch("/user").then(function (user) {
        el("submit-login").textContent = user.login;
      });
    } else {
      el("submit-login").textContent = "(local preview, not signed in)";
    }
    if (currentIssueNumber) {
      loadExistingIssue(currentIssueNumber);
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
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
  }

  el("fetch-btn").addEventListener("click", function () {
    var parsed = parseRepoUrl(el("repo-url-input").value);
    if (!parsed) {
      el("fetch-status").textContent = "That doesn't look like a github.com/owner/repo URL.";
      return;
    }
    el("fetch-status").textContent = "Fetching...";
    ghFetch("/repos/" + parsed.owner + "/" + parsed.repo)
      .then(function (repoData) {
        if (!el("name-input").value) el("name-input").value = humanize(repoData.name);
        if (!el("description-input").value) el("description-input").value = repoData.description || "";
        updatePreview();

        return ghFetch("/repos/" + parsed.owner + "/" + parsed.repo + "/readme").then(function (readme) {
          var text = atob(readme.content.replace(/\n/g, ""));
          var found = [];
          [MD_IMAGE_RE, IMG_TAG_RE].forEach(function (re) {
            var m;
            while ((m = re.exec(text))) found.push(m[1]);
          });
          readmeCandidates = found
            .filter(function (u) { return !BADGE_RE.test(u); })
            .map(function (u) {
              if (/^https?:\/\//.test(u)) return u;
              var cleanPath = u.replace(/^\.?\//, "");
              return "https://raw.githubusercontent.com/" + parsed.owner + "/" + parsed.repo + "/" + repoData.default_branch + "/" + cleanPath;
            })
            .filter(function (u, i, arr) { return arr.indexOf(u) === i; })
            .slice(0, 12);
          renderCandidates();
          el("fetch-status").textContent = "Fetched. Edit anything above before submitting.";
        });
      })
      .catch(function (err) {
        el("fetch-status").textContent = "Couldn't fetch that repo (" + err.message + "). Make sure it's public.";
      });
  });

  function renderCandidates() {
    var host = el("readme-candidates");
    host.innerHTML = "";
    host.style.display = readmeCandidates.length ? "flex" : "none";
    readmeCandidates.forEach(function (url) {
      var chip = document.createElement("div");
      chip.className = "imf-chip";
      chip.style.cursor = "pointer";
      chip.title = "Click to add";

      var img = document.createElement("img");
      img.src = url;
      img.style.width = "2rem";
      img.style.height = "2rem";
      img.style.objectFit = "cover";
      chip.appendChild(img);

      chip.addEventListener("click", function () { addScreenshot(url); });
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

  var PLACEHOLDER_COUNT = 3;

  function renderScreenshots() {
    var host = el("modal-media");
    host.innerHTML = "";
    screenshots.forEach(function (url, i) {
      var img = document.createElement("img");
      img.src = url;
      img.className = "modal-media-item is-loaded";
      img.title = "Click to remove";
      img.addEventListener("click", function () {
        screenshots.splice(i, 1);
        renderScreenshots();
      });
      host.appendChild(img);
    });
    for (var i = screenshots.length; i < PLACEHOLDER_COUNT; i++) {
      var placeholder = document.createElement("span");
      placeholder.className = "modal-media-item modal-media-placeholder";
      placeholder.textContent = "?";
      host.appendChild(placeholder);
    }
    updatePreview();
    updateSubmitEnabled();
  }

  el("add-screenshot-btn").addEventListener("click", function () {
    addScreenshot(el("screenshot-url-input").value);
    el("screenshot-url-input").value = "";
  });

  // ---- light sdk toggle ---------------------------------------------------

  el("light-sdk-toggle").addEventListener("click", function () {
    lightSdk = !lightSdk;
    el("light-sdk-toggle").textContent = "made with light sdk: " + (lightSdk ? "yes" : "no");
    el("light-sdk-toggle").dataset.value = lightSdk ? "Yes" : "No";
  });

  // ---- author line + live bits --------------------------------------------

  function updatePreview() {
    var parsed = parseRepoUrl(el("repo-url-input").value);
    el("modal-author-line").textContent = parsed ? parsed.owner : "";
  }

  ["repo-url-input"].forEach(function (id) {
    el(id).addEventListener("input", function () { updatePreview(); });
  });
  ["name-input", "category-input", "description-input"].forEach(function (id) {
    el(id).addEventListener("input", updateSubmitEnabled);
  });

  function updateSubmitEnabled() {
    var ok = el("name-input").value.trim() &&
      el("category-input").value &&
      el("description-input").value.trim() &&
      screenshots.length > 0;
    el("submit-btn").disabled = !ok;
  }

  // ---- building and sending the issue -------------------------------------

  function buildBody() {
    var lines = [];
    lines.push("### App name", "", el("name-input").value.trim(), "");
    lines.push("### Repository URL", "", el("repo-url-input").value.trim(), "");
    lines.push("### Category", "", el("category-input").value, "");
    lines.push("### Built with the Light SDK?", "", el("light-sdk-toggle").dataset.value, "");
    lines.push("### Short description", "", el("description-input").value.trim(), "");
    lines.push("### Long description", "", el("long-description-input").value.trim() || "_No response_", "");
    lines.push("### Screenshots", "", screenshots.join("\n"), "");
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
      .then(function (issue) {
        var body = issue.body || "";
        el("name-input").value = field(body, "App name");
        el("repo-url-input").value = field(body, "Repository URL");
        el("category-input").value = field(body, "Category");
        lightSdk = field(body, "Built with the Light SDK?") === "Yes";
        el("light-sdk-toggle").textContent = "made with light sdk: " + (lightSdk ? "yes" : "no");
        el("light-sdk-toggle").dataset.value = lightSdk ? "Yes" : "No";
        el("description-input").value = field(body, "Short description");
        el("long-description-input").value = field(body, "Long description");
        screenshots = field(body, "Screenshots").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        renderScreenshots();
        updatePreview();
        el("submit-btn").textContent = "Update submission";
        el("submit-result").innerHTML = 'Editing <a href="' + issue.html_url + '" target="_blank">issue #' + number + "</a>.";
      })
      .catch(function (err) {
        showError("Couldn't load issue #" + number + " (" + err.message + ").");
      });
  }

  el("submit-btn").addEventListener("click", function () {
    el("submit-btn").disabled = true;
    var payload = {
      title: (currentIssueNumber ? "" : "New submission: ") + el("name-input").value.trim(),
      body: buildBody(),
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
      .then(function (issue) {
        currentIssueNumber = issue.number;
        history.replaceState({}, "", REDIRECT_URI + "?issue=" + issue.number);
        el("submit-result").innerHTML = 'Done - <a href="' + issue.html_url + '" target="_blank">view issue #' + issue.number + "</a>. A bot will open a PR shortly; come back to this page to edit before it's reviewed.";
        el("submit-btn").textContent = "Update submission";
      })
      .catch(function (err) {
        showError("Couldn't submit (" + err.message + ").");
      })
      .finally(function () { updateSubmitEnabled(); });
  });
})();
