import express from "express";
import mysql, {
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
dotenv.config();

interface IDBResponse {
  rows: RowDataPacket[];
  totalFindedItems: number;
}

type ListParams = {
  offset: number;
  limit: number;
  queryFilter: QueryFilter;
};

const queryFilterKeys = ["search", "author", "year"] as const;

type QueryFilterKey = (typeof queryFilterKeys)[number];

type QueryFilter = Partial<Record<QueryFilterKey, string>>;

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
const ADMIN_TEMPLATE_PATH = path.join(process.cwd(), "views", "admin.html");
const BOOK_PAGE_TEMPLATE_PATH = path.join(
  process.cwd(),
  "views",
  "book-page.html",
);

async function getDataFromDB(
  offset: number,
  limit: number,
  queryFilter: QueryFilter,
  isAdmin = false,
): Promise<IDBResponse> {
  const filterParams = [];
  const fromJoins = ` FROM books
          INNER JOIN book_authors ON books.id = book_authors.book_id
          INNER JOIN authors ON book_authors.author_id = authors.id `;
  const select = ` SELECT books.id AS bookId, books.name AS bookName, authors.name AS authorName `;
  const selectCount = ` SELECT COUNT(*) AS total `;
  let where = "";

  const whereSelector: Record<
    QueryFilterKey,
    { where: string; searchParams: string[] }
  > = {
    search: {
      where: ` WHERE books.name LIKE ? OR authors.name LIKE ? `,
      searchParams: [`%${queryFilter.search!}%`, `%${queryFilter.search!}%`],
    },
    author: {
      where: ` WHERE authors.name LIKE ? `,
      searchParams: [`%${queryFilter.author!}%`],
    },
    year: {
      where: ` WHERE books.year LIKE ? `,
      searchParams: [`%${queryFilter.year!}%`],
    },
  };

  const activeQuerry = Object.keys(queryFilter)[0] as
    keyof QueryFilter | undefined;
  if (activeQuerry && whereSelector[activeQuerry]) {
    where = whereSelector[activeQuerry].where;
    filterParams.push(...whereSelector[activeQuerry].searchParams);
  }

  const limitOffset = ` LIMIT ? OFFSET ? `;
  const selectSql = `${select} ${fromJoins} ${where} ${limitOffset};`;
  const countSql = `${selectCount} ${fromJoins} ${where};`;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(selectSql, [
      ...filterParams,
      limit,
      offset,
    ]);
    const [countRows] = await pool.query<RowDataPacket[]>(
      countSql,
      filterParams,
    );
    const total = countRows[0]?.total ?? 0;
    return { rows, totalFindedItems: total };
  } catch (error) {
    console.error("Помилка підключення до БД:", error);
    throw error;
  }
}

function renderAddBookForm() {
  return "";
}

function renderAdminBookPanel(
  id: number,
  title: string,
  author: string,
  year: number,
  isbn: number,
  views: number,
  clicks: number,
): string {
  return "";
}
app.get("/", async (req, res) => {
  const params = parseListParams(req);
  if (!params) {
    return res.status(400).send("Невірний формат query параметрів");
  }

  try {
    const html = isAdmin(req)
      ? await buildAdminPage(params)
      : await buildUserPage(params);
    res.type("html").send(html);
  } catch (error) {
    res.status(500).send("Помилка підключення до бази даних");
  }
});

function parseListParams(req: express.Request): ListParams | null {
  const offset = Number(req.query["offset"]) || 0;
  const limit = Number(req.query["limit"]) || 20;
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit <= 0
  ) {
    return null;
  }
  const queryName = queryFilterKeys.find((key) => req.query[key] !== undefined);
  const query = queryName ? (req.query[queryName] as string) : undefined;
  const queryFilter = queryName ? { [queryName]: query } : {};
  return { offset, limit, queryFilter };
}

async function buildUserPage({ offset, limit, queryFilter }: ListParams) {
  try {
    const { rows, totalFindedItems } = await getDataFromDB(
      offset,
      limit,
      queryFilter,
    );
    const booksHtml = rows
      .map((row) => renderBookPanel(row.bookId, row.bookName, row.authorName))
      .join("\n");
    const paginationHtml = renderPagination(
      offset,
      limit,
      totalFindedItems,
      queryFilter,
    );
    const template = await fs.readFile(BOOKS_TEMPLATE_PATH, "utf-8");
    return template
      .replace("<!--BOOKS-->", booksHtml)
      .replace("<!--PAGINATION-->", paginationHtml);
  } catch (error) {
    throw error;
  }
}

async function buildAdminPage({ offset, limit, queryFilter }: ListParams) {
  try {
    const { rows, totalFindedItems } = await getDataFromDB(
      offset,
      limit,
      queryFilter,
      true,
    );
    const booksBlock = rows
      .map((row) =>
        renderAdminBookPanel(
          row.bookId,
          row.bookName,
          row.authorName,
          row.bookYear,
          row.bookIsbn,
          row.views,
          row.clicks,
        ),
      )
      .join("\n");
    const paginationHtml = renderAdminPagination(
      offset,
      limit,
      totalFindedItems,
      queryFilter,
    );
    const addForm = renderAddBookForm();
    const template = await fs.readFile(ADMIN_TEMPLATE_PATH, "utf-8");
    return template
      .replace("<!--BOOKS-->", booksBlock)
      .replace("<!--PAGINATION-->", paginationHtml)
      .replace("<!--ADD_FORM-->", addForm);
  } catch (error) {
    throw error;
  }
}

function isAdmin(req: express.Request) {
  return req.query["admin"] === "1";
}

async function updateBookCounts(
  counter: "views_count" | "clicks_count",
  id: number,
): Promise<boolean> {
  const update = ` UPDATE books `;
  const setCount = ` SET ${counter} = ${counter} + 1 `;
  const where = ` WHERE id = ? `;
  try {
    const [updateResult] = await pool.query<ResultSetHeader>(
      `
      ${update}
      ${setCount}
      ${where}
      `,
      [id],
    );
    return updateResult.affectedRows !== 0;
  } catch (error) {
    throw error;
  }
}

async function getBookData(id: number): Promise<RowDataPacket[]> {
  try {
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
    return bookData;
  } catch (error) {
    throw error;
  }
}

app.get("/book/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).send("Невірний ідентифікатор книги");
  }

  try {
    const isCountUpdated = await updateBookCounts("views_count", id);

    if (!isCountUpdated) {
      return res.status(404).send("Книгу не знайдено");
    }
    const bookData = await getBookData(id);
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
    const isCountUpdated = await updateBookCounts("clicks_count", bookId);
    if (!isCountUpdated) {
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

function renderBookPanel(id: number, title: string, author: string): string {
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

function renderAdminPagination(
  offset: number,
  limit: number,
  total: number,
  filter: QueryFilter,
): string {
  return "";
}

function renderPagination(
  offset: number,
  limit: number,
  total: number,
  filter: QueryFilter,
): string {
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = nextOffset < total;
  const filterInputs = Object.entries(filter)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return `
    <div class="pagination-controls" style="margin-top:20px; display:flex; align-items:center; gap:10px;">
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${prevOffset}">
        <input type="hidden" name="limit" value="${limit}">
        ${filterInputs}
        <button type="submit" class="btn btn-default" ${hasPrev ? "" : "disabled"}>← Назад</button>
      </form>
      <form method="GET" action="/" style="display:inline;">
        <input type="hidden" name="offset" value="${nextOffset}">
        <input type="hidden" name="limit" value="${limit}">
        ${filterInputs}
        <button type="submit" class="btn btn-default" ${hasNext ? "" : "disabled"}>Вперед →</button>
      </form>
    </div>`;
}

app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на http://localhost:${PORT}`);
});
