const fs = require("fs");
const fetch = require("node-fetch");
const jsdom = require("jsdom");
const iconv = require("iconv-lite");
const { PromisePool } = require("@supercharge/promise-pool");

const { JSDOM } = jsdom;

function fetchWithTimeout(url, delay, onTimeout) {
  const timer = new Promise((resolve) => {
    setTimeout(resolve, delay, {
      timeout: true,
    });
  });
  return Promise.race([
    fetch(url),
    timer
  ]).then(response => {
    if (response.timeout) {
      onTimeout();
    }
    return response;
  });
}

async function parse_news(link) {
  const full_link = link;
  const page_html = await fetchWithTimeout(full_link, 3000, () => {}).then((res) => res.text());

  const document = new JSDOM(page_html).window.document;

  const title = document.querySelector("h1").textContent;
  const timestamp = document
    .querySelector(".article__header__date")
    .getAttribute("datetime");
  const paragraphs = document.querySelectorAll(".article__text p");
  let text = "";
  for (const p of paragraphs) {
    text += `${p.textContent}\n`;
  }
  let tags = [];
  for (const t of document.querySelectorAll(".article__tags__container a")) {
    tags.push(t.textContent);
  }
  return {
    full_link,
    timestamp,
    title: title.trim(),
    text: text.trim(),
    tags,
  };
}

async function get_news_for_date(date) {
  console.log(`Fetching news for ${date}`);

  const page_html = await fetch(
    `https://www.rbc.ru/v10/ajax/get-news-feed/project/rbcnews.uploaded/lastDate/${date / 1000}/limit/99`
  ).then((res) => res.text());
  const page = JSON.parse(page_html);
  let news_links = [];
  for (const e of page.items) {
    news_links.push(e.html.match(/href=("[^"]+)/gm)[0].slice(6))
  }
  console.log(`Found ${news_links.length} news`);

  const { results: news, errors } = await PromisePool.for(news_links)
    .withConcurrency(1)
    .process(async (l, index) => {
      console.log(`${index + 1}/${news_links.length} ${l}`);
      return await parse_news(l);
    });
  
  if (errors.length > 0) {
    console.log(`Got ${errors.length} errors!`);
  }

  return news;
}

async function get_news_for_date_and_save(date) {
  const file_name = `${process.argv[2]}/rbc_${date.toDateString()}.json`;
  if (fs.existsSync(file_name)) {
    return;
  }
  const news = await get_news_for_date(date);
  fs.writeFileSync(file_name, JSON.stringify(news, null, 2));
}

(async function action() {
  let now = new Date();
  now.setHours(0,0,0,0);
  while (true) {
    try {
      await get_news_for_date_and_save(now);
    } catch (e) {
      continue;
    }
    now = new Date(now - 86400000);
  }
})();
