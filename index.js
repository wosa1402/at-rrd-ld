// ==UserScript==
// @name         Auto Read
// @namespace    http://tampermonkey.net/
// @version      1.4.6
// @description  自动刷linuxdo文章
// @author       liuweiqing
// @match        https://meta.discourse.org/*
// @match        https://linux.do/*
// @match        https://meta.appinn.net/*
// @match        https://community.openai.com/
// @match        https://idcflare.com/*
// @exclude      https://linux.do/a/9611/0
// @grant        none
// @license      MIT
// @icon         https://www.google.com/s2/favicons?domain=linux.do
// @downloadURL https://update.greasyfork.org/scripts/489464/Auto%20Read.user.js
// @updateURL https://update.greasyfork.org/scripts/489464/Auto%20Read.meta.js
// ==/UserScript==

(function () {
  ("use strict");
  // 定义可能的基本URL
  const possibleBaseURLs = [
    "https://linux.do",
    "https://meta.discourse.org",
    "https://meta.appinn.net",
    "https://community.openai.com",
    "https://idcflare.com/",
  ];
  const commentLimit = 1000;
  const topicListLimit = 100;
  const likeLimit = 50;
  // 获取当前页面的URL
  const currentURL = window.location.href;

  // 确定当前页面对应的BASE_URL
  let BASE_URL = possibleBaseURLs.find((url) => currentURL.startsWith(url));
  console.log("currentURL:", currentURL);
  // 环境变量：阅读网址，如果没有找到匹配的URL，则默认为第一个
  if (!BASE_URL) {
    BASE_URL = possibleBaseURLs[0];
    console.log("默认BASE_URL设置为: " + BASE_URL);
  } else {
    console.log("当前BASE_URL是: " + BASE_URL);
  }

  console.log("脚本正在运行在: " + BASE_URL);
  //1.进入网页 https://linux.do/t/topic/数字（1，2，3，4）
  //2.使滚轮均衡的往下移动模拟刷文章
  // 检查是否是第一次运行脚本
  function checkFirstRun() {
    if (localStorage.getItem("isFirstRun") === null) {
      console.log("脚本第一次运行，执行初始化操作...");
      updateInitialData();
      localStorage.setItem("isFirstRun", "false");
    } else {
      console.log("脚本非第一次运行");
    }
  }

  // 更新初始数据的函数
  function updateInitialData() {
    localStorage.setItem("read", "false"); // 开始时自动滚动关闭
    localStorage.setItem("autoLikeEnabled", "false"); //默认关闭自动点赞
    console.log("执行了初始数据更新操作");
  }
  const delay = 2000; // 滚动检查的间隔（毫秒）
  let scrollInterval = null;
  let checkScrollTimeout = null;
  let autoLikeInterval = null;

  function scrollToBottomSlowly(distancePerStep = 20, delayPerStep = 50) {
    if (scrollInterval !== null) {
      clearInterval(scrollInterval);
    }
    scrollInterval = setInterval(() => {
      window.scrollBy(0, distancePerStep);
    }, delayPerStep); // 每50毫秒滚动20像素
  }

  function getLatestTopic() {
    let latestPage = Number(localStorage.getItem("latestPage")) || 0;
    let topicList = [];
    let isDataSufficient = false;

    while (!isDataSufficient) {
      latestPage++;
      const url = `${BASE_URL}/latest.json?no_definitions=true&page=${latestPage}`;

      $.ajax({
        url: url,
        async: false,
        success: function (result) {
          if (
            result &&
            result.topic_list &&
            result.topic_list.topics.length > 0
          ) {
            result.topic_list.topics.forEach((topic) => {
              // 未读且评论数小于 commentLimit
              if (commentLimit > topic.posts_count) {
                //其实不需要 !topic.unseen &&
                topicList.push(topic);
              }
            });

            // 检查是否已获得足够的 topics
            if (topicList.length >= topicListLimit) {
              isDataSufficient = true;
            }
          } else {
            isDataSufficient = true; // 没有更多内容时停止请求
          }
        },
        error: function (XMLHttpRequest, textStatus, errorThrown) {
          console.error(XMLHttpRequest, textStatus, errorThrown);
          isDataSufficient = true; // 遇到错误时也停止请求
        },
      });
    }

    if (topicList.length > topicListLimit) {
      topicList = topicList.slice(0, topicListLimit);
    }

    // 其实不需要对latestPage操作
    // localStorage.setItem("latestPage", latestPage);
    localStorage.setItem("topicList", JSON.stringify(topicList));
  }

  function openNewTopic() {
    let topicListStr = localStorage.getItem("topicList");
    let topicList = topicListStr ? JSON.parse(topicListStr) : [];

    // 如果列表为空，则获取最新文章
    if (topicList.length === 0) {
      getLatestTopic();
      topicListStr = localStorage.getItem("topicList");
      topicList = topicListStr ? JSON.parse(topicListStr) : [];
    }

    // 如果获取到新文章，打开第一个
    if (topicList.length > 0) {
      const topic = topicList.shift();
      localStorage.setItem("topicList", JSON.stringify(topicList));
      if (topic.last_read_post_number) {
        window.location.href = `${BASE_URL}/t/topic/${topic.id}/${topic.last_read_post_number}`;
      } else {
        window.location.href = `${BASE_URL}/t/topic/${topic.id}`;
      }
    }
  }

  // 检查是否已滚动到底部(不断重复执行),到底部时跳转到下一个话题
  function checkScroll() {
    if (localStorage.getItem("read")) {
      if (
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 100
      ) {
        console.log("已滚动到底部");
        // 到达底部再处理点赞：此时页面内容更完整，且跳转前点赞更容易真正写入站内记录
        if (isAutoLikeEnabled()) {
          stableLikeAndNextTopic();
        } else {
          openNewTopic();
        }
      } else {
        scrollToBottomSlowly();
        if (checkScrollTimeout !== null) {
          clearTimeout(checkScrollTimeout);
        }
        checkScrollTimeout = setTimeout(checkScroll, delay);
      }
    }
  }

  // 入口函数
  window.addEventListener("load", () => {
    checkFirstRun();
    console.log(
      "autoRead",
      localStorage.getItem("read"),
      "autoLikeEnabled",
      localStorage.getItem("autoLikeEnabled")
    );
     if (localStorage.getItem("read") === "true") {
       console.log("执行正常的滚动和检查逻辑");
       checkScroll();
     }
   });

  // 获取当前时间戳
  const currentTime = Date.now();
  // 获取存储的时间戳
  const defaultTimestamp = new Date("1999-01-01T00:00:00Z").getTime(); //默认值为1999年
  const storedTime = parseInt(
    localStorage.getItem("clickCounterTimestamp") ||
      defaultTimestamp.toString(),
    10
  );

  // 获取当前的点击计数，如果不存在则初始化为0
  let clickCounter = parseInt(localStorage.getItem("clickCounter") || "0", 10);
  // 检查是否超过24小时（24小时 = 24 * 60 * 60 * 1000 毫秒）
  if (currentTime - storedTime > 24 * 60 * 60 * 1000) {
    // 超过24小时，清空点击计数器并更新时间戳
    clickCounter = 0;
    localStorage.setItem("clickCounter", "0");
    localStorage.setItem("clickCounterTimestamp", currentTime.toString());
  }

  console.log(`Initial clickCounter: ${clickCounter}`);
  function triggerClick(button) {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    button.dispatchEvent(event);
  }

  // 稳定点赞策略：更适合自动阅读（频繁跳转话题）的场景
  // - 不再在页面 load 时批量排队点赞（容易在跳转时被打断）
  // - 改为“到达话题底部、准备跳转前”最多点赞 1 次
  // - 默认每 2~4 个话题点赞 1 次（大约 2 小时 30~50 个，且波动更小）
  function getRandomIntInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getAutoLikeEveryTopicsRange() {
    const min = Number.parseInt(
      localStorage.getItem("autoLikeEveryTopicsMin") || "2",
      10
    );
    const max = Number.parseInt(
      localStorage.getItem("autoLikeEveryTopicsMax") || "4",
      10
    );

    const safeMin = Number.isFinite(min) && min > 0 ? min : 2;
    const safeMax = Number.isFinite(max) && max >= safeMin ? max : safeMin;
    return { min: safeMin, max: safeMax };
  }

  function resetTopicsUntilNextLike() {
    const { min, max } = getAutoLikeEveryTopicsRange();
    const value = getRandomIntInclusive(min, max);
    localStorage.setItem("autoLikeTopicsUntilNext", String(value));
    return value;
  }

  function decrementTopicsUntilNextLike() {
    let remaining = Number.parseInt(
      localStorage.getItem("autoLikeTopicsUntilNext") || "",
      10
    );
    if (!Number.isFinite(remaining) || remaining <= 0) {
      remaining = resetTopicsUntilNextLike();
    }
    remaining -= 1;
    localStorage.setItem("autoLikeTopicsUntilNext", String(remaining));
    return remaining;
  }

  function getEligibleLikeButtons() {
    const buttons = Array.from(
      document.querySelectorAll(".discourse-reactions-reaction-button")
    );

    return buttons.filter((button) => {
      if (!button) return false;
      if (
        button.title !== "点赞此帖子" &&
        button.title !== "Like this post"
      ) {
        return false;
      }
      if (button.disabled) return false;
      if (button.getAttribute("aria-disabled") === "true") return false;
      return true;
    });
  }

  function getVisibleButtons(buttons) {
    return buttons.filter((button) => {
      try {
        const rect = button.getBoundingClientRect();
        if (!rect) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        return rect.bottom >= 0 && rect.top <= window.innerHeight;
      } catch (e) {
        return false;
      }
    });
  }

  function pickRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function tryStableLikeOnce() {
    if (clickCounter >= likeLimit) {
      console.log("已达到点赞上限，跳过点赞");
      localStorage.setItem("autoLikeEnabled", "false");
      return false;
    }

    const candidates = getEligibleLikeButtons();
    if (candidates.length === 0) {
      console.log("未找到可点赞按钮，跳过");
      return false;
    }

    const visible = getVisibleButtons(candidates);
    const pool = visible.length > 0 ? visible : candidates;

    const button = pickRandomItem(pool);
    triggerClick(button);

    clickCounter += 1;
    localStorage.setItem("clickCounter", clickCounter.toString());
    console.log(`稳定点赞成功：${clickCounter}/${likeLimit}`);
    try {
      const record = {
        url: window.location.href,
        ts: Date.now(),
      };
      console.log(`__AUTO_LIKE_RECORD__${JSON.stringify(record)}`);
    } catch (e) {}

    if (clickCounter >= likeLimit) {
      localStorage.setItem("autoLikeEnabled", "false");
      console.log("已达到点赞上限，自动关闭点赞");
    }

    return true;
  }

  function stableLikeAndNextTopic() {
    const remaining = decrementTopicsUntilNextLike();
    if (remaining > 0) {
      // 还没到点赞时机，直接跳到下一个话题
      openNewTopic();
      return;
    }

    const liked = tryStableLikeOnce();
    if (liked) {
      resetTopicsUntilNextLike();
    } else {
      // 如果本话题没有找到可点赞按钮，下个话题尽快再尝试一次
      localStorage.setItem("autoLikeTopicsUntilNext", "1");
    }

    // 给站内请求一点时间，避免跳转太快导致点赞没写入
    const waitMs = getRandomIntInclusive(1200, 2500);
    setTimeout(() => {
      openNewTopic();
    }, waitMs);
  }
  const button = document.createElement("button");
  // 初始化按钮文本基于当前的阅读状态
  button.textContent =
    localStorage.getItem("read") === "true" ? "停止阅读" : "开始阅读";
  button.style.position = "fixed";
  button.style.bottom = "10px"; // 之前是 top
  button.style.left = "10px"; // 之前是 right
  button.style.zIndex = 1000;
  button.style.backgroundColor = "#f0f0f0"; // 浅灰色背景
  button.style.color = "#000"; // 黑色文本
  button.style.border = "1px solid #ddd"; // 浅灰色边框
  button.style.padding = "5px 10px"; // 内边距
  button.style.borderRadius = "5px"; // 圆角
  document.body.appendChild(button);

  button.onclick = function () {
    const currentlyReading = localStorage.getItem("read") === "true";
    const newReadState = !currentlyReading;
    localStorage.setItem("read", newReadState.toString());
    button.textContent = newReadState ? "停止阅读" : "开始阅读";
    if (!newReadState) {
      if (scrollInterval !== null) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }
      if (checkScrollTimeout !== null) {
        clearTimeout(checkScrollTimeout);
        checkScrollTimeout = null;
      }
      localStorage.removeItem("navigatingToNextTopic");
    } else {
      // 如果是Linuxdo，就导航到我的帖子
      if (BASE_URL == "https://linux.do") {
        window.location.href = "https://linux.do/t/topic/13716/900";
      } else {
        window.location.href = `${BASE_URL}/t/topic/1`;
      }
      checkScroll();
    }
  };

  //自动点赞按钮
  // 在页面上添加一个控制自动点赞的按钮
  const toggleAutoLikeButton = document.createElement("button");
  toggleAutoLikeButton.textContent = isAutoLikeEnabled()
    ? "禁用自动点赞"
    : "启用自动点赞";
  toggleAutoLikeButton.style.position = "fixed";
  toggleAutoLikeButton.style.bottom = "50px"; // 之前是 top，且与另一个按钮错开位置
  toggleAutoLikeButton.style.left = "10px"; // 之前是 right
  toggleAutoLikeButton.style.zIndex = "1000";
  toggleAutoLikeButton.style.backgroundColor = "#f0f0f0"; // 浅灰色背景
  toggleAutoLikeButton.style.color = "#000"; // 黑色文本
  toggleAutoLikeButton.style.border = "1px solid #ddd"; // 浅灰色边框
  toggleAutoLikeButton.style.padding = "5px 10px"; // 内边距
  toggleAutoLikeButton.style.borderRadius = "5px"; // 圆角
  document.body.appendChild(toggleAutoLikeButton);

  // 为按钮添加点击事件处理函数
  toggleAutoLikeButton.addEventListener("click", () => {
    const isEnabled = !isAutoLikeEnabled();
    setAutoLikeEnabled(isEnabled);
    toggleAutoLikeButton.textContent = isEnabled
      ? "禁用自动点赞"
      : "启用自动点赞";
  });
  // 判断是否启用自动点赞
  function isAutoLikeEnabled() {
    // 429 等情况下会设置一个“冷却期”，冷却期内暂不点赞，到点后自动恢复
    const cooldownUntil = Number.parseInt(
      localStorage.getItem("autoLikeCooldownUntil") || "0",
      10
    );
    if (Number.isFinite(cooldownUntil) && cooldownUntil > 0) {
      if (cooldownUntil > Date.now()) {
        return false;
      }
      localStorage.removeItem("autoLikeCooldownUntil");
    }

    // 从localStorage获取autoLikeEnabled的值，如果未设置，默认为"true"
    return localStorage.getItem("autoLikeEnabled") !== "false";
  }

  // 设置自动点赞的启用状态
  function setAutoLikeEnabled(enabled) {
    localStorage.setItem("autoLikeEnabled", enabled ? "true" : "false");
  }
})();
