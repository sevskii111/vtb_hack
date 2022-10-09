const fs = require("fs");
const fetch = require("node-fetch");
const jsdom = require("jsdom");
const iconv = require("iconv-lite");
const { PromisePool } = require("@supercharge/promise-pool");

const { JSDOM } = jsdom;

async function get_news_page_for_date(date, page) {
  const page_html = await fetch(
    `https://www.interfax.ru/news/${date.getFullYear()}/${
      date.getMonth() + 1
    }/${date.getDate()}/all/page_${page}`
  ).then((res) => res.text());
  const document = new JSDOM(page_html).window.document;
  const curr_page = document.querySelector(".pages a.active").text;
  if (curr_page != page) {
    return [];
  }
  const news = document.querySelectorAll(".an div");
  let news_links = [];
  for (const n of news) {
    const link_el = n.querySelector("a");
    if (link_el) {
      news_links.push(link_el.href);
    }
  }
  return news_links;
}

async function parse_news(link) {
  const full_link = link.includes("https://")
    ? link
    : `https://www.interfax.ru${link}`;
  const page_html_buffer = await fetch(full_link).then((res) => res.buffer());
  const page_html = iconv
    .encode(iconv.decode(page_html_buffer, "cp1251"), "utf8")
    .toString();

  const document = new JSDOM(page_html).window.document;

  const title = document.querySelector("h1").textContent;
  const timestamp = document
    .querySelector("time[datetime]")
    .getAttribute("datetime");
  const paragraphs = document.querySelectorAll("article p");
  let text = "";
  for (const p of paragraphs) {
    text += `${p.textContent}\n`;
  }
  let tags = [];
  for (const t of document.querySelectorAll(".textMTags a")) {
    tags.push(t.textContent);
  }
  return {
    full_link,
    timestamp,
    title,
    text,
    tags,
  };
}

async function get_news_for_date(date) {
  console.log(`Fetching news for ${date}`);
  let news_links = [];
  for (let page = 1; true; page++) {
    const curr_page = await get_news_page_for_date(date, page);
    if (!curr_page.length) {
      break;
    }
    news_links.push(...curr_page);
  }
  console.log(`Found ${news_links.length} news`);

  const { results: news, errors } = await PromisePool.for(news_links)
    .withConcurrency(10)
    .process(async (l, index) => {
      console.log(`${index + 1}/${news_links.length}`);
      return await parse_news(l);
    });
  
  if (errors.length > 0) {
    console.log(`Got ${errors.length} errors!`);
  }

  return news;
}

async function get_news_for_date_and_save(date) {
  const file_name = `${process.argv[2]}/interfax_${date.toDateString()}.json`;
  if (fs.existsSync(file_name)) {
    return;
  }
  const news = await get_news_for_date(date);
  fs.writeFileSync(file_name, JSON.stringify(news, null, 2));
}

(async function action() {
  let now = new Date();
  while (true) {
    try {
      await get_news_for_date_and_save(now);
    } catch (e) {
      continue;
    }
    now = new Date(now - 86400000);
  }
})();
