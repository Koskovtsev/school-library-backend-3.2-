import express from "express";
import mysql, {
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import type QueryString from "qs";
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
app.use(express.json());
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
    const search = req.query["search"];
    const author = req.query["author"];

    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      return res.status(400).send("Невірний формат query параметрів");
    }
    const querySelectors = [];
    let sqlSelect = `SELECT books.id AS bookId, books.name AS bookName, authors.name AS authorName
          FROM books 
          INNER JOIN book_authors ON books.id=book_authors.book_id
          INNER JOIN authors ON book_authors.author_id=authors.id
          `;
    const queryCountSelectors = [];
    let sqlCountRows = `SELECT COUNT(*) AS total
                FROM books 
                INNER JOIN book_authors ON books.id=book_authors.book_id
                INNER JOIN authors ON book_authors.author_id=authors.id
                `;
    let renderSearch;
    if (search) {
      const sqlWhere = `WHERE books.name LIKE ? OR authors.name LIKE ? `;
      sqlSelect += sqlWhere;
      querySelectors.push(`%${search}%`);
      querySelectors.push(`%${search}%`);
      sqlCountRows += sqlWhere;
      queryCountSelectors.push(`%${search}%`);
      queryCountSelectors.push(`%${search}%`);
      renderSearch = search;
    }
    if (author) {
      const sqlWhere = `WHERE authors.name LIKE ? `;
      sqlSelect += sqlWhere;
      querySelectors.push(`%${author}%`);
      sqlCountRows += sqlWhere;
      queryCountSelectors.push(`%${author}%`);
      renderSearch = author;
    }
    querySelectors.push(limit);
    querySelectors.push(offset);
    sqlSelect += `LIMIT ? OFFSET ?`;
    const formattedQuery = mysql.format(sqlSelect, querySelectors);
    console.log("Реальний SQL-запит до бази:", formattedQuery);
    console.log(`querrys: ${JSON.stringify(querySelectors)}, 
    selector: ${sqlSelect}`);
    const [rows] = await pool.query<RowDataPacket[]>(sqlSelect, querySelectors);
    const [countRows] = await pool.query<RowDataPacket[]>(
      sqlCountRows,
      queryCountSelectors,
    );
    const booksHtml = rows
      .map((row) => renderBookItem(row.bookId, row.bookName, row.authorName))
      .join("\n");
    const total = countRows[0]?.total ?? 0;
    const paginationHtml = renderPagination(offset, limit, total, renderSearch);

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
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send("Невірний ідентифікатор книги");
    }
    const [updateResult] = await pool.query<ResultSetHeader>(
      `UPDATE books
      SET views_count = views_count + 1 
      WHERE id = ?`,
      [id],
    );
    if (updateResult?.affectedRows === 0) {
      return res.status(404).send("Книгу не знайдено");
    }
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
      WHERE books.id=?`,
      [id],
    );
    if (bookData.length === 0) {
      return res.status(404).send("Книгу не знайдено");
    }
    const bookHtml = renderBook(bookData);
    const template = await fs.readFile(BOOK_PAGE_TEMPLATE_PATH, "utf-8");
    const html = template.replace("<!--BOOK-->", bookHtml);
    res.type("html").send(html);
  } catch (error) {
    console.error("Помилка підключення до БД:", error);
    res.status(500).send("Помилка підключення до бази даних");
  }
});

app.post("/book/", async (req, res) => {
  const bookId = Number(req.body.bookId);
  if (!Number.isInteger(bookId) || bookId <= 0) {
    return res.status(400).send("Невірний ідентифікатор книги");
  }
  try {
    const [updateClick] = await pool.query<ResultSetHeader>(
      `UPDATE books
      SET clicks_count = clicks_count + 1 
      WHERE id = ?`,
      [bookId],
    );
    if (updateClick?.affectedRows === 0) {
      return res.status(404).send("Книгу не знайдено");
    }
    res.status(200).send({ ok: "OK" });
  } catch (error) {
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
                  <div class="bookRow"><span class="properties">автор:</span><a href="http://localhost:${PORT}/?author=__AUTHOR__"><span id="author">__AUTHOR__</span></a></div>
                  <div class="bookRow"><span class="properties">год:</span><a href="http://localhost:${PORT}/?year=__YEAR__"><span id="year">__YEAR__</span></a></div>
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
  search:
    | string
    | QueryString.ParsedQs
    | (string | QueryString.ParsedQs)[]
    | undefined,
): string {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;
  const searchTag = `<input type="hidden" name="search" value="${search}">`;
  return `
    <div class="pagination-controls" style="margin-top:20px; display:flex; align-items:center; gap:10px;">
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${prevOffset}">
        <input type="hidden" name="limit" value="${limit}">
        ${search ? searchTag : ""}
        <button type="submit" class="btn btn-default" ${hasPrev ? "" : "disabled"}>← Назад</button>
      </form>
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${nextOffset}">
        <input type="hidden" name="limit" value="${limit}">
        ${search ? searchTag : ""}
        <button type="submit" class="btn btn-default" ${hasNext ? "" : "disabled"}>Вперед →</button>
      </form>
    </div>`;
}

app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на http://localhost:${PORT}`);
});
