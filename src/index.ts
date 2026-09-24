import express from "express";
import mysql, { type RowDataPacket } from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.use(express.static("public", { index: false }));
const BOOKS_TEMPLATE_PATH = path.join(process.cwd(), "views", "index.html");
const BOOK_PAGE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "views",
  "book-page.html",
);

app.get("/", async (req, res) => {
  try {
    const offset = Number(req.query["offset"]) || 0;
    const limit = Number(req.query["limit"]) || 20;
    const [rows] = await pool.query<
      RowDataPacket[]
    >(`SELECT books.id AS bookId, books.name AS bookName, authors.name AS authorName
          FROM books 
          INNER JOIN book_authors ON books.id=book_authors.book_id
          INNER JOIN authors ON book_authors.author_id=authors.id
          LIMIT ${limit} OFFSET ${offset};`);
    const [countRows] = await pool.query<
      RowDataPacket[]
    >(`SELECT COUNT(*) AS total_books
          FROM books 
          INNER JOIN book_authors ON books.id=book_authors.book_id
          INNER JOIN authors ON book_authors.author_id=authors.id`);
    const booksHtml = rows
      .map((row) => renderBookItem(row.bookId, row.bookName, row.authorName))
      .join("\n");
    const total = countRows[0]?.total_books ?? 0;
    const paginationHtml = renderPagination(offset, limit, total);

    // + `ofset: ${offset}, limit: ${limit}, total: ${total}`;
    const template = await fs.readFile(BOOKS_TEMPLATE_PATH, "utf-8");
    const html = template
      .replace("<!--BOOKS-->", booksHtml)
      .replace("<!--PAGINATION-->", paginationHtml);
    res.type("html").send(html);
  } catch (error) {
    console.error("Помилка підключення до БД:", error);
    res.status(500).send("Помилка підключення до бази даних");
  }
});

app.get("/book/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const [bookData] = await pool.query<RowDataPacket[]>(
      `SELECT 
        books.id AS bookId, 
        books.name AS bookName, 
        books.description AS bookDescription,
        books.year AS bookYear,
        books.n_pages AS bookPages,
        books.isbn AS bookIsbn,
        books.views_count AS bookViewsCount,
        books.clicks_count AS bookClicksCount,
        authors.name AS authorName
      FROM books 
      INNER JOIN book_authors ON books.id=book_authors.book_id
      INNER JOIN authors ON book_authors.author_id=authors.id
      WHERE books.id=${id}`,
    );

    const bookHtml = renderBook(bookData);
    const template = await fs.readFile(BOOK_PAGE_TEMPLATE_PATH, "utf-8");
    const html = template.replace("<!--BOOK-->", bookHtml);
    res.type("html").send(html);
  } catch (error) {
    console.error("Помилка підключення до БД:", error);
    res.status(500).send("Помилка підключення до бази даних");
  }
});

function renderBook(book: RowDataPacket[]): string {
  return `<div id="id" book-id="__ID__">
            <div id="bookImg" class="col-xs-12 col-sm-3 col-md-3 item"><img src="/book-page_files/__ID__.jpg"
              alt="Responsive image" class="img-responsive">
              <hr>
            </div>
            <div class="col-xs-12 col-sm-9 col-md-9 col-lg-9 info">
              <div class="bookInfo col-md-12">
                <div id="title" class="titleBook">__TITLE__</div>
              </div>
              <div class="col-xs-12 col-sm-12 col-md-12 col-lg-12">
                <div class="bookLastInfo">
                  <div class="bookRow"><span class="properties">автор:</span><span id="author">__AUTHOR__</span></div>
                  <div class="bookRow"><span class="properties">год:</span><span id="year">__YEAR__</span></div>
                  <div class="bookRow"><span class="properties">страниц:</span><span id="pages">__PAGES__</span></div>
                  <div class="bookRow"><span class="properties">isbn:</span><span id="isbn">__ISBN__</span></div>
                </div>
                <div class="btnBlock col-xs-12 col-sm-12 col-md-12">
                  <button type="button" class="btnBookID btn-lg btn btn-success">Хочу читать!</button>
                </div>
                <div class="bookDescription col-xs-12 col-sm-12 col-md-12 hidden-xs hidden-sm">
                  <h4>О книге</h4>
                  <hr>
                  <p id="description">__DESCRIPTION__</p>
                </div>
              </div>
              <div class="bookDescription col-xs-12 col-sm-12 col-md-12 hidden-md hidden-lg">
                <h4>О книге</h4>
                <hr>
                <p class="description">__DESCRIPTION__</p>
              </div>
            </div>
          </div>`
    .replace(/__ID__/g, String(book[0]?.bookId))
    .replace(/__AUTHOR__/g, escapeHtml(book[0]?.authorName))
    .replace(/__TITLE__/g, escapeHtml(book[0]?.bookName))
    .replace(/__YEAR__/g, String(book[0]?.bookYear))
    .replace(/__PAGES__/g, String(book[0]?.bookPages))
    .replace(/__ISBN__/g, String(book[0]?.bookIsbn))
    .replace(/__DESCRIPTION__/g, escapeHtml(book[0]?.bookDescription));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function renderBookItem(id: number, title: string, author: string): string {
  return `<div data-book-id="__ID__" class="book_item col-xs-6 col-sm-3 col-md-2 col-lg-2">
            <div class="book">
              <a href="http://localhost:${PORT}/book/__ID__"><img src="./books-page_files/__ID__.jpg" alt="__TITLE__">
                <div data-title="__TITLE__" class="blockI" style="height: 46px;">
                 <div data-book-title="__TITLE__" class="title size_text">__TITLE__</div>
                  <div data-book-author="__AUTHOR__" class="author">__AUTHOR__</div>
                </div>
              </a>
              <a href="http://localhost:${PORT}/book/__ID__">
               <button type="button" class="details btn btn-success">Читать</button>
              </a>
            </div>
          </div>`
    .replace(/__ID__/g, String(id))
    .replace(/__AUTHOR__/g, escapeHtml(author))
    .replace(/__TITLE__/g, escapeHtml(title));
}

function renderPagination(
  offset: number,
  limit: number,
  total: number,
): string {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;
  // const currentPage = Math.floor(offset / limit) + 1;
  // const totalPages = Math.ceil(total / limit);

  // let pagesHtml = "";
  // for (let i = 1; i <= totalPages; i++) {
  //   const pageOffset = (i - 1) * limit;
  //   const isActive = i === currentPage;
  //   pagesHtml += `
  //     <li class="page-item ${isActive ? "active" : ""}" style="list-style:none;">
  //       <a class="page-link" href="/?offset=${pageOffset}&limit=${limit}"${isActive ? ' aria-current="page"' : ""}>${i}</a>
  //     </li>`;
  // }

  return `
    <div class="pagination-controls" style="margin-top:20px; display:flex; align-items:center; gap:10px;">
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${prevOffset}">
        <input type="hidden" name="limit" value="${limit}">
        <button type="submit" class="btn btn-default" ${hasPrev ? "" : "disabled"}>← Назад</button>
      </form>
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${nextOffset}">
        <input type="hidden" name="limit" value="${limit}">
        <button type="submit" class="btn btn-default" ${hasNext ? "" : "disabled"}>Вперед →</button>
      </form>
    </div>`;
}

app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на http://localhost:${PORT}`);
});

//  <ul class="pagination" style="display:flex; list-style:none; margin:0; padding:0; gap:4px;">
//     ${pagesHtml}
//  </ul>
