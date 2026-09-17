(() => {
  "use strict";

  const LIST_PATH = "/career/recruitment/onsite";
  const LIST_API = "/career/api/home/recruitmentList";
  const READ_KEY = "uestc-recruitment-reader:read";
  const DETAIL_SLUGS = {
    ONSITE: "onsite",
    GROUP: "group",
    RECRUITMENT: "aerial",
    ONLINE_RECRUITMENT: "online",
    INTERNSHIP_RECRUITMENT: "internship"
  };
  const TIME_RANGES = new Map([
    ["今日招聘", "TODAY"],
    ["明日招聘", "TOMORROW"],
    ["未来一周", "NEXT_WEEK"],
    ["未来一月", "NEXT_MONTH"],
    ["全部招聘", "ALL"]
  ]);

  let busy = false;
  const searchState = {
    active: false,
    loading: false,
    query: "",
    scope: "all",
    type: "ALL",
    page: 1,
    pageSize: 20,
    total: 0,
    totalPage: 0,
    records: []
  };

  function isListPage() {
    return window.location.pathname.replace(/\/$/, "") === LIST_PATH;
  }

  function readSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function saveRead(fingerprint) {
    const records = readSet();
    records.add(fingerprint);
    localStorage.setItem(READ_KEY, JSON.stringify([...records].slice(-2000)));
  }

  function idFingerprint(id) {
    return `id:${id}`;
  }

  function fingerprint(card) {
    const title = card.querySelector(".title")?.textContent?.trim() || "";
    const details = card.querySelector(".info-top-style")?.textContent?.trim() || "";
    return `${title}|${details.replace(/\s+/g, " ")}`;
  }

  function markReadCards() {
    if (!isListPage()) return;
    const records = readSet();
    document.querySelectorAll(".notice-list-container .list-item").forEach((card) => {
      card.classList.toggle("uestc-reader-read", records.has(fingerprint(card)));
    });
  }

  function selectedTimeRange() {
    const buttons = [...document.querySelectorAll(".list-search button")];
    const selected = buttons.find((button) => button.classList.contains("el-button--primary"));
    return TIME_RANGES.get(selected?.textContent?.trim()) || "ALL";
  }

  function currentPage() {
    const active = document.querySelector('.el-pager li.is-active, .el-pager li[aria-current="true"]');
    return Number.parseInt(active?.textContent || "1", 10) || 1;
  }

  function currentPageSize() {
    const pagination = document.querySelector(".el-pagination");
    const match = pagination?.textContent?.match(/(10|20|50)\s*条\s*\/\s*页/);
    return match ? Number.parseInt(match[1], 10) : document.querySelectorAll(".list-item").length || 10;
  }

  function base36Id(id) {
    return BigInt(String(id)).toString(36);
  }

  function detailUrl(record) {
    const slug = DETAIL_SLUGS[record.recruitmentTypeCode];
    if (!slug) throw new Error(`暂不支持招聘类型：${record.recruitmentTypeLabel || record.recruitmentTypeCode}`);
    return `${window.location.origin}/career/recruitment/${slug}/${base36Id(record.id)}`;
  }

  function normalized(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function findRecord(records, card, clickedIndex) {
    const title = normalized(card.querySelector(".title")?.textContent);
    const details = normalized(card.querySelector(".info-top-style")?.textContent);

    const exact = records.find((record) => {
      const date = String(record.recruitmentDate || "").slice(0, 10);
      return (
        normalized(record.companyName) === title &&
        (!date || details.includes(date)) &&
        (!record.recruitmentLocation || details.includes(normalized(record.recruitmentLocation)))
      );
    });

    return exact || records[clickedIndex];
  }

  async function loadVisibleRecords() {
    const response = await fetch(LIST_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ONSITE",
        timeRange: selectedTimeRange(),
        pageIndex: currentPage(),
        pageSize: currentPageSize(),
        isSearchPage: false,
        searchParams: []
      })
    });

    if (!response.ok) {
      throw new Error(`列表接口返回 ${response.status}`);
    }

    const payload = await response.json();
    if (payload.code !== 0 || !Array.isArray(payload.data)) {
      throw new Error(payload.msg || "未取得招聘记录");
    }
    return payload.data;
  }

  function searchConditions() {
    const value = searchState.query;
    const conditions = [];

    if (searchState.scope === "company" || searchState.scope === "all") {
      conditions.push({
        keyword: "name",
        operator: "包含",
        value,
        relation: "并且"
      });
    }
    if (searchState.scope === "title" || searchState.scope === "all") {
      conditions.push({
        keyword: "title",
        operator: "包含",
        value,
        relation: searchState.scope === "all" ? "或者" : "并且"
      });
    }
    if (searchState.type !== "ALL") {
      conditions.push({
        keyword: "recruitment_type_code",
        operator: "=",
        value: searchState.type,
        relation: "并且"
      });
    }
    return conditions;
  }

  async function loadSearchResults() {
    const response = await fetch(LIST_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageIndex: searchState.page,
        pageSize: searchState.pageSize,
        isSearchPage: true,
        searchParams: searchConditions()
      })
    });

    if (!response.ok) throw new Error(`搜索接口返回 ${response.status}`);
    const payload = await response.json();
    if (payload.code !== 0 || !Array.isArray(payload.data)) {
      throw new Error(payload.msg || "搜索失败");
    }

    searchState.records = payload.data;
    searchState.total = Number(payload.page?.totalCount || 0);
    searchState.totalPage = Number(payload.page?.totalPage || 0);
  }

  function toast(message, isError = false) {
    document.querySelector(".uestc-reader-toast")?.remove();
    const element = document.createElement("div");
    element.className = `uestc-reader-toast${isError ? " is-error" : ""}`;
    element.textContent = message;
    document.body.append(element);
    window.setTimeout(() => element.remove(), isError ? 5000 : 2200);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    return String(value || "").slice(0, 10) || "日期未注明";
  }

  function renderSearchResults() {
    const root = document.querySelector("#uestc-search-results");
    const main = root?.closest(".list-page-main");
    if (!root || !main) return;

    main.classList.toggle("uestc-search-active", searchState.active);
    if (!searchState.active) {
      root.replaceChildren();
      return;
    }

    if (searchState.loading) {
      root.innerHTML = '<div class="uestc-search-empty">正在搜索...</div>';
      return;
    }

    const reads = readSet();
    const cards = searchState.records
      .map((record, index) => {
        const isRead = reads.has(idFingerprint(record.id));
        const title = record.title || record.occupationCategoryLabel?.join("、") || "未注明职位或招聘标题";
        const location = record.recruitmentLocation || record.workLocation || "地点未注明";
        return `
          <button class="uestc-search-card${isRead ? " is-read" : ""}" type="button" data-index="${index}">
            <span class="uestc-search-card-top">
              <span class="uestc-search-company">${escapeHtml(record.companyName || "未注明单位")}</span>
              <span class="uestc-search-badges">
                <span class="uestc-search-badge">${escapeHtml(record.recruitmentTypeLabel || "招聘信息")}</span>
                ${isRead ? '<span class="uestc-search-badge is-read">已读</span>' : ""}
              </span>
            </span>
            <span class="uestc-search-title">${escapeHtml(title)}</span>
            <span class="uestc-search-meta">
              <span>${escapeHtml(formatDate(record.recruitmentDate))}</span>
              <span>${escapeHtml(location)}</span>
            </span>
          </button>`;
      })
      .join("");

    root.innerHTML = `
      <div class="uestc-search-summary">
        <span>找到 ${searchState.total} 条结果</span>
        <span>关键词：${escapeHtml(searchState.query)}</span>
      </div>
      <div class="uestc-search-list">
        ${cards || '<div class="uestc-search-empty">没有找到匹配的招聘信息</div>'}
      </div>
      ${
        searchState.totalPage > 1
          ? `<div class="uestc-search-pagination">
              <button class="uestc-search-page-button" type="button" data-page-action="previous"${searchState.page <= 1 ? " disabled" : ""}>上一页</button>
              <span class="uestc-search-page-state">第 ${searchState.page} / ${searchState.totalPage} 页</span>
              <button class="uestc-search-page-button" type="button" data-page-action="next"${searchState.page >= searchState.totalPage ? " disabled" : ""}>下一页</button>
            </div>`
          : ""
      }`;
  }

  async function runSearch(page = 1) {
    const input = document.querySelector("#uestc-search-input");
    const scope = document.querySelector("#uestc-search-scope");
    const type = document.querySelector("#uestc-search-type");
    const button = document.querySelector("#uestc-search-submit");
    const query = input?.value.trim() || "";
    if (!query) {
      toast("请输入公司名称或关键词", true);
      input?.focus();
      return;
    }

    searchState.active = true;
    searchState.loading = true;
    searchState.query = query;
    searchState.scope = scope?.value || "all";
    searchState.type = type?.value || "ALL";
    searchState.page = page;
    button && (button.disabled = true);
    renderSearchResults();

    try {
      await loadSearchResults();
      searchState.loading = false;
      renderSearchResults();
      document.querySelector("#uestc-search-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      searchState.loading = false;
      searchState.records = [];
      searchState.total = 0;
      searchState.totalPage = 0;
      renderSearchResults();
      toast(`搜索失败：${error.message || "未知错误"}`, true);
    } finally {
      button && (button.disabled = false);
    }
  }

  function resetSearch() {
    searchState.active = false;
    searchState.loading = false;
    searchState.records = [];
    searchState.total = 0;
    searchState.totalPage = 0;
    const input = document.querySelector("#uestc-search-input");
    if (input) input.value = "";
    renderSearchResults();
  }

  function ensureSearchPanel() {
    if (!isListPage() || document.querySelector("#uestc-search-panel")) return;
    const title = document.querySelector(".list-loading-wrapper .list-page-title");
    if (!title) return;

    const panel = document.createElement("section");
    panel.id = "uestc-search-panel";
    panel.className = "uestc-search-panel";
    panel.innerHTML = `
      <form class="uestc-search-form" id="uestc-search-form">
        <input class="uestc-search-input" id="uestc-search-input" type="search" placeholder="搜索公司名称或招聘关键词" autocomplete="off">
        <select class="uestc-search-select" id="uestc-search-scope" aria-label="搜索范围">
          <option value="all">公司或标题</option>
          <option value="company">仅公司名称</option>
          <option value="title">仅招聘标题</option>
        </select>
        <select class="uestc-search-select" id="uestc-search-type" aria-label="招聘类型">
          <option value="ALL">全部招聘</option>
          <option value="ONSITE">现场招聘</option>
          <option value="GROUP">组团招聘</option>
          <option value="RECRUITMENT">空中宣讲</option>
          <option value="ONLINE_RECRUITMENT">网上招聘</option>
          <option value="INTERNSHIP_RECRUITMENT">实习招聘</option>
        </select>
        <button class="uestc-search-button" id="uestc-search-submit" type="submit">搜索</button>
        <button class="uestc-search-button uestc-search-reset" id="uestc-search-reset" type="button">清除</button>
      </form>
      <div class="uestc-search-results" id="uestc-search-results"></div>`;
    title.insertAdjacentElement("afterend", panel);

    panel.querySelector("#uestc-search-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch(1);
    });
    panel.querySelector("#uestc-search-reset")?.addEventListener("click", resetSearch);
    panel.querySelector("#uestc-search-results")?.addEventListener("click", async (event) => {
      const card = event.target.closest(".uestc-search-card");
      const action = event.target.closest("[data-page-action]")?.dataset.pageAction;

      if (card) {
        const record = searchState.records[Number(card.dataset.index)];
        if (!record) return;
        try {
          saveRead(idFingerprint(record.id));
          await chrome.runtime.sendMessage({ type: "OPEN_RECRUITMENT_DETAIL", url: detailUrl(record) });
          renderSearchResults();
        } catch (error) {
          toast(`打开失败：${error.message || "未知错误"}`, true);
        }
        return;
      }

      if (action === "previous" && searchState.page > 1) runSearch(searchState.page - 1);
      if (action === "next" && searchState.page < searchState.totalPage) runSearch(searchState.page + 1);
    });
  }

  async function openDetail(card, clickedIndex) {
    if (busy) return;
    busy = true;
    card.classList.add("uestc-reader-loading");

    try {
      const records = await loadVisibleRecords();
      const record = findRecord(records, card, clickedIndex);
      if (!record?.id) throw new Error("无法匹配当前招聘记录");

      const url = detailUrl(record);
      saveRead(fingerprint(card));
      card.classList.add("uestc-reader-read");
      await chrome.runtime.sendMessage({ type: "OPEN_RECRUITMENT_DETAIL", url });
    } catch (error) {
      console.error("[成电招聘阅读助手]", error);
      toast(`打开失败：${error.message || "未知错误"}`, true);
    } finally {
      card.classList.remove("uestc-reader-loading");
      busy = false;
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!isListPage() || event.button !== 0) return;
      const wrapper = event.target.closest(".notice-list-container .article-link-wrapper");
      if (!wrapper) return;

      const cards = [...document.querySelectorAll(".notice-list-container .list-item")];
      const card = wrapper.closest(".list-item");
      const clickedIndex = cards.indexOf(card);
      if (!card || clickedIndex < 0) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      openDetail(card, clickedIndex);
    },
    true
  );

  function refreshEnhancements() {
    ensureSearchPanel();
    markReadCards();
  }

  const observer = new MutationObserver(refreshEnhancements);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  refreshEnhancements();
})();
