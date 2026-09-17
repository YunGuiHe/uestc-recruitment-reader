chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "OPEN_RECRUITMENT_DETAIL") {
    return;
  }

  const target = new URL(message.url);
  if (
    target.origin !== "https://jiuye.uestc.edu.cn" ||
    !/^\/career\/recruitment\/(onsite|group|aerial|online|internship)\/[0-9a-z-]+$/.test(
      target.pathname
    )
  ) {
    return;
  }

  chrome.tabs.create({ url: target.href, active: true });
});
